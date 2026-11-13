// app/admin/pedidos.tsx
/**
 * Qué hace: pantalla de administración "Pedidos". Lista los pedidos que los clientes
 * confirman en app/checkout.tsx, con sus artículos, el tipo de entrega y los datos de
 * contacto, y permite cambiar el estado (pendiente → confirmado → preparado → enviado →
 * entregado, o cancelado).
 *
 * Cómo funciona:
 * - Lee "pedidos" y "pedido_items" (supabase/migrations/20261013120000_pedidos.sql).
 *   Solo el administrador puede verlos todos y cambiar el estado (RLS con is_admin()).
 * - Los pedidos no se borran: se cancelan.
 * - Si la tabla aún no existe (migración sin aplicar) lo dice en pantalla.
 *
 * Tamaños del móvil (grupo 4, 2026-11-12): ningún texto de menos de 13 px, grises no más claros que
 * COLORES_TEXTO.secundario, texto azul pequeño en azulTexto y todo lo que se toca (filtros, botones de
 * estado, volver, «Escribir al cliente») de 44 px como mínimo y con 8 px entre botones, para no cambiar
 * el estado de un pedido sin querer (constants/theme.ts; prueba TM4 de pruebas/perfil-datos.mjs).
 *
 * Conectado con:
 * - app/admin/index.tsx → tarjeta "Pedidos" que lleva aquí.
 * - app/admin/_layout.tsx → registra esta ruta ("pedidos") en el Stack.
 * - app/checkout.tsx → crea los pedidos con la función crear_pedido.
 * - api/escaparate-retorno.ts → al cambiar el estado se le avisa, por si el pedido lleva
 *   artículos de VeoAura (al cancelarlo, VeoAura los vuelve a poner a la venta).
 * - Números de seguimiento (migración 20261031170000): cada pedido enseña el suyo, si es una ficha
 *   creada en VeoAura (api/escaparate-veoaura.ts, evento «seguimiento») y si el cliente ya lo tiene
 *   en su cuenta; recuento arriba y filtros «Sin cuenta» y «De VeoAura».
 * - Envío (migración 20261104210000, dueño 2026-11-04): cada pedido enseña artículos, envío (con su
 *   zona) y total. El envío lo calcula la base de datos con las tarifas (Administración → Tarifas de
 *   envío); aquí se puede poner A MANO para ese pedido (queda «a mano» y ya no se recalcula) o
 *   devolverlo al automático. Sin la migración, no se enseña.
 * - Pago con tarjeta (Stripe, migración 20261105120000, dueño 2026-11-05; api/pago.ts): cada pedido enseña si se pagó
 *   con tarjeta (cuánto y cuándo, con su enlace a Stripe y si fue de prueba) o si el pago se empezó sin terminar;
 *   recuento arriba y filtros «Pagados con tarjeta» y «Pago sin terminar». Lo apunta solo el servidor tras
 *   preguntárselo a Stripe. Si un pedido pagado se cancela o cambia de total, lo avisa (devolver desde Stripe). Sin la
 *   migración, no se enseña. Desde el 2026-11-11 (Bizum de Stripe, migración 20261111150000) cada pagado dice con qué se
 *   pagó («Pagado online con tarjeta / Bizum / Klarna», lo dice Stripe) y el recuento de arriba los cuenta por forma de
 *   pago; sin esa columna, todo sale como antes.
 * - Botones «Devolver el pago» y «Cancelar pedido» (dueño, 2026-11-06), con un segundo toque para confirmar. Devolver
 *   llama a api/pago.ts (solo el administrador; Stripe devuelve el pago entero una sola vez) y se ve «Devuelto · importe
 *   · fecha» (migración 20261106100000; sin ella no se ofrece). Un cancelado pagado sin devolver sigue en «En curso».
 * - Facturas (dueño, 2026-11-10; las emite VeoAura y llegan por api/escaparate-veoaura.ts, evento «factura»; migración
 *   20261110100000, tabla pedido_facturas): cada pedido enseña su número de factura y «Descargar» (api/factura.ts, la
 *   misma que usa el cliente en «Mis pedidos»), «PDF pendiente» o «Sin factura»; recuento arriba y filtro «Factura:
 *   todas / con factura / sin factura». Sin la migración, no se enseña.
 * - Referencia del pedido (dueño, 2026-11-11: «como una empresa profesional»): el título de cada pedido es su referencia
 *   «Pedido VZ-XXXX-XXXX» (codigo_seguimiento, la que ve el cliente) y el número interno va debajo, en pequeño («Nº
 *   interno 101»; sin referencia, «Pedido nº 101» como antes). Buscador arriba: referencia (con o sin guiones), número
 *   interno, nombre, correo o teléfono. El mensaje de WhatsApp que manda el administrador también nombra la referencia.
 * - Ventas en tienda (dueño, 2026-11-11; migración 20261111170000, pedidos.origen = 'tienda_fisica'): las ventas en mano
 *   que VeoAura manda con el evento «venta_tienda» (api/escaparate-veoaura.ts) salen como un pedido más con «En tienda ·
 *   pagado <forma> · entregado» y «Unida a la cuenta del cliente» o «Pendiente de que se registre <correo>»; recuento
 *   arriba (cuántas, importe, unidas y pendientes) y filtro «En tienda». Sin envío, teléfono, cambio de estado, cancelar ni
 *   WhatsApp (las gestiona VeoAura). Sin la migración, no se enseña nada de esto.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StatusBar, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { abrirDescarga, openExternalLink } from "../../lib/openExternalLink";
import { supabase } from "../../lib/supabase";
import { cargarTarifas, fmtKg, type ZonaEnvio } from "../../lib/envio";
import CargaMarca from "../../components/marca/CargaMarca";
import { COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/theme";

type Estado = "pendiente" | "confirmado" | "preparado" | "enviado" | "entregado" | "cancelado";

type PedidoItem = { id: string; product_id: string | null; titulo: string; precio_eur: number };

type Pedido = {
  id: string;
  numero: number;
  created_at: string;
  estado: Estado;
  entrega: "envio" | "recogida";
  nombre: string;
  email: string;
  telefono: string;
  direccion: string | null;
  codigo_postal: string | null;
  ciudad: string | null;
  notas: string | null;
  total_eur: number;
  pedido_items: PedidoItem[];
  // Número de seguimiento (migración 20261031170000; puede no existir aún): el cliente lo escribe en «Mis seguimientos»
  // para añadir el pedido a su cuenta. id_veoaura: la ficha se creó en VeoAura.
  user_id?: string | null;
  codigo_seguimiento?: string | null;
  id_veoaura?: string | null;
  vinculado_en?: string | null;
  // Nota interna: «Asignado desde el chat» si lo creó el administrador desde Administración → Chat.
  nota_admin?: string | null;
  // Envío (migración 20261104210000; puede no existir aún): artículos + envío = total.
  productos_eur?: number | null;
  envio_eur?: number | null;
  zona_envio?: string | null;
  // Peso del pedido con embalaje (envío por kilos, migración 20261107120000).
  peso_kg?: number | null;
  envio_manual?: boolean | null;
  // Pago con tarjeta (migración 20261105120000; puede no existir aún).
  pago_estado?: "iniciado" | "pagado" | null;
  pago_modo?: "prueba" | "real" | null;
  pago_referencia?: string | null;
  pagado_eur?: number | string | null;
  pagado_en?: string | null;
  // Con qué se pagó online, según Stripe (migración 20261111150000; puede no existir aún).
  pago_metodo?: "card" | "klarna" | "bizum" | null;
  // Devolución (migración 20261106100000; puede no existir aún).
  devuelto_eur?: number | string | null;
  devuelto_en?: string | null;
  // Venta en mano registrada en VeoAura (evento «venta_tienda», migración 20261111170000; puede no existir aún).
  origen?: "web" | "tienda_fisica" | null;
  veoaura_venta_id?: string | null;
  venta_forma_pago?: string | null;
};

// Cómo se pagó una venta en mano (lo dice VeoAura).
const FORMA_PAGO_TIENDA: Record<string, string> = { efectivo: "en efectivo", tarjeta: "con tarjeta", bizum: "con Bizum", transferencia: "por transferencia", otro: "" };
const enTienda = (p: Pedido) => p.origen === "tienda_fisica";

// Nombre de la forma de pago online (tarjeta, Bizum o Klarna), si Stripe la dijo.
const METODO_PAGO: Record<string, string> = { card: "tarjeta", bizum: "Bizum", klarna: "Klarna" };

// Enlace al pago en el panel de Stripe (los de prueba van a su apartado de prueba).
function enlaceStripe(p: Pedido): string | null {
  if (!p.pago_referencia || !/^pi_[A-Za-z0-9]+$/.test(p.pago_referencia)) return null;
  return `https://dashboard.stripe.com/${p.pago_modo === "prueba" ? "test/" : ""}payments/${p.pago_referencia}`;
}

// «5,90» → 5.9; vacío o mal escrito → null.
function leerImporte(texto: string): number | null {
  const t = texto.trim().replace(/\s|€/g, "").replace(",", ".");
  return /^\d{1,3}(\.\d{1,2})?$/.test(t) ? Number(t) : null;
}

// La pone api/asignar-seguimiento.ts al asignar un seguimiento desde el chat.
const NOTA_ASIGNADO_CHAT = "Asignado desde el chat";

const ESTADOS: { value: Estado; label: string }[] = [
  { value: "pendiente", label: "Pendiente" },
  { value: "confirmado", label: "Confirmado" },
  { value: "preparado", label: "Preparado" },
  { value: "enviado", label: "Enviado" },
  { value: "entregado", label: "Entregado" },
  { value: "cancelado", label: "Cancelado" },
];

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: COLORES_TEXTO.secundario,
  accent: COLORES_TEXTO.azulMarca,
  // Texto azul de menos de 17 px (enlaces, precios, filtros): azul oscuro; el de marca queda para iconos y bordes.
  accentDark: COLORES_TEXTO.azulTexto,
  accent2: "#EAF6FD",
  danger: "#B91C1C",
  gold: "#B8860B",
};

// Precio siempre con dos decimales, coma decimal y miles con punto (155,00€ · 1.299,00€).
function fmtEUR(n: number) {
  const v = Number(n);
  const cents = Math.round((Number.isFinite(v) ? v : 0) * 100);
  const [ent, dec] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${cents < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

function fmtFecha(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Número de seguimiento del pedido: de dónde viene (VeoAura) y si el cliente ya lo tiene en su cuenta. Si no, el número
// es lo que hay que darle para que lo añada en Perfil → «Mis seguimientos».
function EtiquetaNumero({
  codigo,
  veoaura,
  enCuenta,
  vinculadoEn,
  desdeChat,
}: {
  codigo: string;
  veoaura: boolean;
  enCuenta: boolean;
  vinculadoEn: string | null;
  desdeChat: boolean;
}) {
  return (
    // La referencia ya va en el título del pedido: aquí, de dónde viene y si el cliente ya la tiene.
    <View accessibilityLabel={`Referencia ${codigo}`} style={{ alignItems: "center", gap: 2 }}>
      <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
        {[
          veoaura ? "Ficha de VeoAura" : null,
          enCuenta
            ? vinculadoEn
              ? `El cliente lo añadió a su cuenta el ${fmtFecha(vinculadoEn)}`
              : desdeChat
                ? "Asignado desde el chat: ya está en la cuenta del cliente"
                : "En la cuenta del cliente"
            : "Aún no está en ninguna cuenta: dale esta referencia al cliente",
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
    </View>
  );
}

export default function PedidosAdmin() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [filtro, setFiltro] = useState<Estado | "activos" | "todos" | "sin_vincular" | "veoaura" | "pagados_tarjeta" | "pago_sin_terminar" | "en_tienda">("activos");
  // false = aún no hay ventas en mano (migración 20261111170000 sin aplicar): ni filtro ni recuento.
  const [ventasOk, setVentasOk] = useState(false);
  // false = aún no hay columnas de pago con tarjeta (migración 20261105120000 sin aplicar): no se enseñan.
  const [pagoOk, setPagoOk] = useState(false);
  // false = aún no hay columnas de devolución (migración 20261106100000 sin aplicar): no se ofrece «Devolver el pago».
  const [devolucionOk, setDevolucionOk] = useState(false);
  // Botón que espera el segundo toque para confirmar («devolver:<id>» o «cancelar:<id>») y su mensaje.
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [accionMsg, setAccionMsg] = useState<{ id: string; tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  // false = aún no hay números de seguimiento (migración sin aplicar): no se enseñan.
  const [numerosOk, setNumerosOk] = useState(false);
  // false = aún no hay columnas de envío (migración 20261104210000 sin pegar): no se enseñan.
  const [envioOk, setEnvioOk] = useState(false);
  const [zonas, setZonas] = useState<ZonaEnvio[] | null>(null);
  // Envío escrito a mano en cada pedido (texto, con coma) y el pedido que se está guardando.
  const [envioEscrito, setEnvioEscrito] = useState<Record<string, string>>({});
  const [envioMsg, setEnvioMsg] = useState<{ id: string; tipo: "ok" | "error"; texto: string } | null>(null);
  // Facturas de VeoAura (migración 20261110100000): false = la tabla aún no existe, no se enseñan. Por pedido, la última.
  const [facturasOk, setFacturasOk] = useState(false);
  const [facturas, setFacturas] = useState<Record<string, { numero_factura: string | null; pdf: boolean }>>({});
  const [filtroFactura, setFiltroFactura] = useState<"todas" | "con" | "sin">("todas");
  const [facturaMsg, setFacturaMsg] = useState<{ id: string; texto: string } | null>(null);
  // Buscador: referencia VZ-…, número interno, nombre, correo o teléfono (dueño, 2026-11-11).
  const [busqueda, setBusqueda] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const base =
      "id,numero,created_at,estado,entrega,nombre,email,telefono,direccion,codigo_postal,ciudad,notas,total_eur,pedido_items(id,product_id,titulo,precio_eur)";
    const NUMEROS = ",user_id,codigo_seguimiento,id_veoaura,vinculado_en,nota_admin";
    const ENVIO = ",productos_eur,envio_eur,zona_envio,envio_manual";
    const PAGO = ",pago_estado,pago_modo,pago_referencia,pagado_eur,pagado_en";
    const consulta = (columnas: string) => supabase.from("pedidos").select(columnas).order("created_at", { ascending: false }).limit(200);
    // Cada grupo de columnas nuevas puede no existir aún (su migración sin aplicar): se quita el que falte y se repite.
    const DEVOLUCION = ",devuelto_eur,devuelto_en";
    // Con qué se pagó online, según Stripe (migración 20261111150000): card, klarna o bizum.
    const METODO = ",pago_metodo";
    // Ventas en mano de VeoAura (migración 20261111170000).
    const VENTA = ",origen,veoaura_venta_id,venta_forma_pago";
    let conVenta = true;
    let conMetodo = true;
    let conDevolucion = true;
    let conPago = true;
    let conEnvio = true;
    let conNumeros = true;
    const columnas = () =>
      `${base}${conNumeros ? NUMEROS : ""}${conEnvio ? ENVIO : ""}${conPago ? PAGO : ""}${conPago && conDevolucion ? DEVOLUCION : ""}${conPago && conMetodo ? METODO : ""}${conVenta ? VENTA : ""}`;
    let res: { data: unknown[] | null; error: { code?: string; message?: string } | null } = await consulta(columnas());
    for (let vuelta = 0; vuelta < 6 && res.error; vuelta++) {
      const msg = String(res.error.message ?? "");
      if (conVenta && /origen|veoaura_venta_id|venta_forma_pago/.test(msg)) conVenta = false;
      else if (conMetodo && /pago_metodo/.test(msg)) conMetodo = false;
      else if (conDevolucion && /devuelto_eur|devuelto_en/.test(msg)) conDevolucion = false;
      else if (conPago && /pago_estado|pago_modo|pago_referencia|pagado_eur|pagado_en/.test(msg)) conPago = false;
      else if (conEnvio && /productos_eur|envio_eur|zona_envio|envio_manual/.test(msg)) conEnvio = false;
      else if (conNumeros && (res.error.code === "42703" || /codigo_seguimiento|id_veoaura|vinculado_en/.test(msg))) conNumeros = false;
      else break;
      res = await consulta(columnas());
    }
    setPagoOk(!res.error && conPago);
    setDevolucionOk(!res.error && conPago && conDevolucion);
    setEnvioOk(!res.error && conEnvio);
    if (conEnvio) cargarTarifas().then(setZonas);
    setNumerosOk(!res.error && conNumeros);
    setVentasOk(!res.error && conVenta);
    const { data, error } = res;
    if (error) {
      const msg = String(error.message ?? "").toLowerCase();
      setErr(
        msg.includes("pedidos") && (msg.includes("does not exist") || msg.includes("could not find"))
          ? "Los pedidos aún no están activados en la base de datos (falta aplicar la migración de pedidos)."
          : "No se han podido cargar los pedidos."
      );
      setPedidos([]);
    } else {
      const lista = (data ?? []) as unknown as Pedido[];
      setPedidos(lista);
      // Facturas de VeoAura de estos pedidos (consulta aparte; sin la tabla, no se enseñan y no falla nada).
      if (lista.length) {
        const fac = await supabase
          .from("pedido_facturas")
          .select("pedido_id,numero_factura,pdf_path,fecha,recibida_en")
          .in("pedido_id", lista.map((p) => p.id));
        if (fac.error) {
          setFacturasOk(false);
          setFacturas({});
        } else {
          const porPedido: Record<string, { numero_factura: string | null; pdf: boolean; orden: string }> = {};
          for (const f of (fac.data ?? []) as { pedido_id: string; numero_factura: string | null; pdf_path: string | null; fecha: string | null; recibida_en: string | null }[]) {
            const orden = `${f.fecha ?? ""}|${f.recibida_en ?? ""}`;
            if (!porPedido[f.pedido_id] || orden > porPedido[f.pedido_id].orden) porPedido[f.pedido_id] = { numero_factura: f.numero_factura, pdf: !!f.pdf_path, orden };
          }
          setFacturasOk(true);
          setFacturas(Object.fromEntries(Object.entries(porPedido).map(([k, v]) => [k, { numero_factura: v.numero_factura, pdf: v.pdf }])));
        }
      }
      // Peso de cada pedido (envío por kilos, migración 20261107120000): consulta aparte; sin la columna, no se enseña.
      if (conEnvio && lista.length) {
        supabase
          .from("pedidos")
          .select("id,peso_kg")
          .in("id", lista.map((p) => p.id))
          .then(({ data: pesos, error: errPeso }) => {
            if (errPeso || !Array.isArray(pesos)) return;
            const mapa = new Map((pesos as { id: string; peso_kg: unknown }[]).map((r) => [r.id, r.peso_kg === null || r.peso_kg === undefined ? null : Number(r.peso_kg)]));
            setPedidos((prev) => prev.map((p) => (mapa.has(p.id) ? { ...p, peso_kg: mapa.get(p.id) ?? null } : p)));
          });
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Facturas: cuántos pedidos la tienen (y de ellas, cuántas con el PDF aún pendiente) y cuántos no.
  const resumenFacturas = useMemo(() => {
    const con = pedidos.filter((p) => !!facturas[p.id]);
    return { con: con.length, pdfPendiente: con.filter((p) => !facturas[p.id].pdf).length, sin: pedidos.length - con.length };
  }, [pedidos, facturas]);

  // «Descargar» la factura de un pedido: la misma API que usa el cliente (api/factura.ts), con la sesión del administrador.
  async function descargarFactura(p: Pedido) {
    setFacturaMsg(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch(`/api/factura?pedido=${encodeURIComponent(p.id)}`, { headers: { Authorization: `Bearer ${s.session?.access_token ?? ""}` } });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
      if (r.ok && d?.ok && d.url) abrirDescarga(d.url);
      else setFacturaMsg({ id: p.id, texto: r.status === 409 ? "El PDF aún está llegando de VeoAura: prueba en unos minutos." : `No se pudo descargar: ${d?.error ?? "sin respuesta del servidor"}.` });
    } catch {
      setFacturaMsg({ id: p.id, texto: "No se pudo descargar: sin conexión." });
    }
  }

  const visiblesPorEstado = useMemo(() => {
    if (filtro === "todos") return pedidos;
    // En curso: también los cancelados que siguen pagados con tarjeta sin devolver (falta devolver el pago).
    if (filtro === "activos") {
      return pedidos.filter((p) => p.estado !== "entregado" && (p.estado !== "cancelado" || (p.pago_estado === "pagado" && !p.devuelto_en)));
    }
    if (filtro === "sin_vincular") return pedidos.filter((p) => !p.user_id);
    if (filtro === "veoaura") return pedidos.filter((p) => !!p.id_veoaura);
    if (filtro === "pagados_tarjeta") return pedidos.filter((p) => p.pago_estado === "pagado");
    if (filtro === "pago_sin_terminar") return pedidos.filter((p) => p.pago_estado === "iniciado");
    if (filtro === "en_tienda") return pedidos.filter(enTienda);
    return pedidos.filter((p) => p.estado === filtro);
  }, [pedidos, filtro]);

  // Ventas en mano (VeoAura): cuántas, cuántas ya están en la cuenta del cliente, cuántas esperan a que se registre y su
  // importe.
  const resumenTienda = useMemo(() => {
    const ventas = pedidos.filter(enTienda);
    return {
      total: ventas.length,
      unidas: ventas.filter((p) => !!p.user_id).length,
      pendientes: ventas.filter((p) => !p.user_id).length,
      importe: ventas.reduce((a, p) => a + Number(p.total_eur ?? 0), 0),
    };
  }, [pedidos]);

  // Filtro «Factura: todas / con factura / sin factura», que se suma al de arriba; y el buscador (referencia VZ-…, con o sin
  // guiones ni mayúsculas, número interno, nombre, correo o teléfono), que busca en TODOS los pedidos cargados.
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (q) {
      const soloLetras = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const soloCifras = q.replace(/[^\d]/g, "");
      return pedidos.filter((p) => {
        const ref = String(p.codigo_seguimiento ?? "").replace(/[^A-Z0-9]/g, "");
        return (
          (soloLetras.length >= 3 && ref.includes(soloLetras)) ||
          (/^\d+$/.test(q) && String(p.numero) === q) ||
          (soloCifras.length >= 6 && String(p.telefono ?? "").replace(/[^\d]/g, "").includes(soloCifras)) ||
          String(p.nombre ?? "").toLowerCase().includes(q) ||
          String(p.email ?? "").toLowerCase().includes(q)
        );
      });
    }
    if (!facturasOk || filtroFactura === "todas") return visiblesPorEstado;
    return visiblesPorEstado.filter((p) => (filtroFactura === "con" ? !!facturas[p.id] : !facturas[p.id]));
  }, [visiblesPorEstado, pedidos, busqueda, facturas, facturasOk, filtroFactura]);

  // Pago con tarjeta: cuántos pedidos se han pagado (y cuánto), cuántos se empezaron sin terminar, cuántos fueron de
  // prueba y cuántos pagados están cancelados o con otro total (hay que devolver la diferencia desde Stripe).
  const resumenPago = useMemo(() => {
    const pagados = pedidos.filter((p) => p.pago_estado === "pagado");
    const reales = pagados.filter((p) => p.pago_modo === "real");
    const devueltos = pagados.filter((p) => !!p.devuelto_en);
    return {
      pagados: pagados.length,
      cobradoReal: reales.reduce((a, p) => a + Number(p.pagado_eur ?? 0), 0),
      dePrueba: pagados.length - reales.length,
      sinTerminar: pedidos.filter((p) => p.pago_estado === "iniciado").length,
      devueltos: devueltos.length,
      devueltoReal: devueltos.filter((p) => p.pago_modo === "real").reduce((a, p) => a + Number(p.devuelto_eur ?? 0), 0),
      porDevolver: pagados.filter(
        (p) => !p.devuelto_en && (p.estado === "cancelado" || Math.round(Number(p.pagado_eur ?? 0) * 100) > Math.round(Number(p.total_eur) * 100))
      ).length,
      // Por forma de pago (lo dice Stripe; los anteriores a pago_metodo no cuentan aquí).
      porMetodo: {
        card: pagados.filter((p) => p.pago_metodo === "card").length,
        bizum: pagados.filter((p) => p.pago_metodo === "bizum").length,
        klarna: pagados.filter((p) => p.pago_metodo === "klarna").length,
      },
    };
  }, [pedidos]);

  // Números de seguimiento: cuántos pedidos vienen de VeoAura y cuántos ya están en la cuenta de su cliente.
  const resumenNumeros = useMemo(() => {
    const deVeoaura = pedidos.filter((p) => !!p.id_veoaura);
    return {
      veoaura: deVeoaura.length,
      veoauraVinculados: deVeoaura.filter((p) => !!p.user_id).length,
      sinVincular: pedidos.filter((p) => !p.user_id).length,
      // (Las compras en mano se unen solas con el correo: no cuentan como «añadidas con su número».)
      anadidosConNumero: pedidos.filter((p) => !!p.vinculado_en && !enTienda(p)).length,
      desdeChat: pedidos.filter((p) => p.nota_admin === NOTA_ASIGNADO_CHAT).length,
    };
  }, [pedidos]);

  async function cambiarEstado(p: Pedido, estado: Estado) {
    if (p.estado === estado) return;
    setGuardando(p.id);
    const { error } = await supabase.from("pedidos").update({ estado }).eq("id", p.id);
    if (error) {
      setErr("No se pudo cambiar el estado del pedido.");
    } else {
      setPedidos((prev) => prev.map((x) => (x.id === p.id ? { ...x, estado } : x)));
      // Si se cancela un pedido con artículos de VeoAura, el servidor se lo avisa a VeoAura
      // (api/escaparate-retorno.ts). No se espera.
      if (Platform.OS === "web") fetch("/api/escaparate-retorno", { method: "POST" }).catch(() => {});
    }
    setGuardando(null);
  }

  // Envío A MANO para este pedido (la base de datos lo marca «a mano» y suma el total) o vuelta al automático (la base
  // de datos lo recalcula con la tarifa). Se lee la fila que deja la base de datos.
  async function guardarEnvio(p: Pedido, automatico: boolean) {
    const precio = automatico ? null : leerImporte(envioEscrito[p.id] ?? "");
    if (!automatico && precio === null) {
      setEnvioMsg({ id: p.id, tipo: "error", texto: "Escribe el envío con números (por ejemplo 6,90), de 0 a 999 €." });
      return;
    }
    setGuardando(p.id);
    setEnvioMsg(null);
    const { data, error } = await supabase
      .from("pedidos")
      .update(automatico ? { envio_manual: false } : { envio_eur: precio })
      .eq("id", p.id)
      .select("productos_eur,envio_eur,zona_envio,envio_manual,total_eur")
      .single();
    if (error || !data) {
      setEnvioMsg({ id: p.id, tipo: "error", texto: "No se pudo cambiar el envío de este pedido." });
    } else {
      const fila = data as Pick<Pedido, "productos_eur" | "envio_eur" | "zona_envio" | "envio_manual" | "total_eur">;
      setPedidos((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...fila } : x)));
      setEnvioEscrito((e) => ({ ...e, [p.id]: "" }));
      setEnvioMsg({ id: p.id, tipo: "ok", texto: automatico ? "Envío otra vez automático (con la tarifa)." : "Envío de este pedido puesto a mano." });
    }
    setGuardando(null);
  }

  // «Devolver el pago» (api/pago.ts, solo el administrador): Stripe devuelve el pago entero y el servidor lo apunta. Y
  // «Cancelar pedido». Los dos piden un segundo toque para confirmar (sin ventanas).
  async function devolverPago(p: Pedido) {
    if (confirmando !== `devolver:${p.id}`) {
      setConfirmando(`devolver:${p.id}`);
      setAccionMsg(null);
      return;
    }
    setConfirmando(null);
    setGuardando(p.id);
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch("/api/pago", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: JSON.stringify({ accion: "devolver", numero: p.numero }),
      });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; devuelto_eur?: number; error?: string } | null;
      if (r.ok && d?.ok) {
        const ahora = new Date().toISOString();
        setPedidos((prev) => prev.map((x) => (x.id === p.id ? { ...x, devuelto_eur: d.devuelto_eur ?? x.pagado_eur, devuelto_en: x.devuelto_en ?? ahora } : x)));
        setAccionMsg({ id: p.id, tipo: "ok", texto: `Pago devuelto: ${fmtEUR(Number(d.devuelto_eur ?? 0))}. Al cliente le llega en 5-10 días hábiles (si era de prueba, no se mueve dinero).` });
      } else {
        setAccionMsg({ id: p.id, tipo: "error", texto: `No se pudo devolver: ${d?.error ?? "sin respuesta del servidor"}.` });
      }
    } catch {
      setAccionMsg({ id: p.id, tipo: "error", texto: "No se pudo devolver: sin conexión. Vuelve a intentarlo." });
    }
    setGuardando(null);
  }

  async function cancelarPedido(p: Pedido) {
    if (confirmando !== `cancelar:${p.id}`) {
      setConfirmando(`cancelar:${p.id}`);
      setAccionMsg(null);
      return;
    }
    setConfirmando(null);
    await cambiarEstado(p, "cancelado");
    setAccionMsg({
      id: p.id,
      tipo: "ok",
      texto: p.pago_estado === "pagado" && !p.devuelto_en ? "Pedido cancelado. Está pagado online: devuelve el pago con el botón de abajo." : "Pedido cancelado.",
    });
  }

  const nombreZona = (z: string | null | undefined) => (z ? zonas?.find((x) => x.zona === z)?.nombre.split(" (")[0] ?? z : null);

  function whatsapp(p: Pedido) {
    const tel = p.telefono.replace(/[^\d]/g, "");
    const conPrefijo = tel.length === 9 ? `34${tel}` : tel;
    // Al cliente, la referencia del pedido (nunca el número interno).
    const ref = p.codigo_seguimiento ? ` ${p.codigo_seguimiento}` : "";
    const texto = encodeURIComponent(`Hola ${p.nombre}, te escribimos por tu pedido${ref} en Videojuegoszaragoza.com.`);
    openExternalLink(`https://wa.me/${conPrefijo}?text=${texto}`);
  }

  const chips: { value: typeof filtro; label: string }[] = [
    { value: "activos", label: "En curso" },
    ...ESTADOS,
    { value: "todos", label: "Todos" },
    ...(numerosOk
      ? [
          { value: "sin_vincular" as const, label: `Sin cuenta (${resumenNumeros.sinVincular})` },
          { value: "veoaura" as const, label: `De VeoAura (${resumenNumeros.veoaura})` },
        ]
      : []),
    ...(pagoOk
      ? [
          { value: "pagados_tarjeta" as const, label: `Pagados online (${resumenPago.pagados})` },
          { value: "pago_sin_terminar" as const, label: `Pago sin terminar (${resumenPago.sinTerminar})` },
        ]
      : []),
    ...(ventasOk ? [{ value: "en_tienda" as const, label: `En tienda (${resumenTienda.total})` }] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado), igual en todo el panel. */}
      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
          paddingHorizontal: 16,
          paddingTop: 10 + insets.top,
          paddingBottom: 10,
        }}
      >
        <View style={{ width: "100%", maxWidth: 760, alignSelf: "center", minHeight: TACTIL.minimo, justifyContent: "center" }}>
          <Pressable
            onPress={() => router.replace("/admin")}
            accessibilityRole="button"
            accessibilityLabel="Volver al panel"
            hitSlop={8}
            style={({ pressed }) => ({
              position: "absolute",
              // Por encima del título, que va después y ocupa todo el ancho (si no, se queda el toque).
              zIndex: 1,
              left: 0,
              top: 0,
              bottom: 0,
              width: TACTIL.minimo,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </Pressable>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 20, textAlign: "center", paddingHorizontal: 44 }}>
            Pedidos
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: "100%", maxWidth: 760, gap: 14 }}>
          {/* Buscador arriba (como Productos y Servicios): con algo escrito busca en todos los pedidos, sin filtros. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg2 }}>
            <Ionicons name="search" size={18} color={COLORS.muted} />
            <TextInput
              nativeID="pedidos-buscar"
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder="Buscar por referencia (VZ-…), nombre, correo o teléfono"
              placeholderTextColor="rgba(11,33,56,0.45)"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Buscar pedidos por referencia, nombre, correo o teléfono"
              style={{ flex: 1, minWidth: 0, minHeight: 44, color: COLORS.text, fontSize: 16, fontWeight: "700" }}
            />
            {busqueda ? (
              <Pressable onPress={() => setBusqueda("")} accessibilityRole="button" accessibilityLabel="Borrar la búsqueda" hitSlop={8} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="close-circle" size={18} color={COLORS.muted} />
              </Pressable>
            ) : null}
          </View>
          <Text nativeID="pedidos-recuento" style={{ color: COLORS.muted, textAlign: "center" }}>
            {loading ? "Cargando…" : busqueda.trim() ? `${visibles.length} ${visibles.length === 1 ? "pedido encontrado" : "pedidos encontrados"}` : `${visibles.length} de ${pedidos.length} pedidos`}
          </Text>
          {/* Dueño, 2026-11-03: «Entregado» cuenta como pagado; si el pedido lleva artículos de VeoAura, su ficha de cliente
              (nombre, correo y teléfono) va a VeoAura (api/escaparate-retorno.ts). Se ve en Administración → Escaparate. */}
          <Text nativeID="pedidos-veoaura-cliente" style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
            Al marcar «Entregado» un pedido con artículos de VeoAura, se envían a VeoAura el nombre, el correo y el teléfono del
            cliente (nunca su dirección).
          </Text>
          {numerosOk && !loading ? (
            <Text nativeID="pedidos-numeros" style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
              Números de seguimiento · de VeoAura: {resumenNumeros.veoaura} (en la cuenta del cliente: {resumenNumeros.veoauraVinculados}) ·
              añadidos con su número: {resumenNumeros.anadidosConNumero} · sin cuenta: {resumenNumeros.sinVincular} · asignados desde
              el chat: {resumenNumeros.desdeChat}
            </Text>
          ) : null}
          {pagoOk && !loading ? (
            <Text nativeID="pedidos-pago-tarjeta" style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
              Pago online (Stripe: tarjeta, Bizum o Klarna) · pagados: {resumenPago.pagados} (cobrado de verdad: {fmtEUR(resumenPago.cobradoReal)}; de prueba:{" "}
              {resumenPago.dePrueba})
              {resumenPago.porMetodo.card + resumenPago.porMetodo.bizum + resumenPago.porMetodo.klarna
                ? ` · con tarjeta: ${resumenPago.porMetodo.card}, Bizum: ${resumenPago.porMetodo.bizum}, Klarna: ${resumenPago.porMetodo.klarna}`
                : ""}{" "}
              · empezados sin terminar: {resumenPago.sinTerminar}
              {resumenPago.devueltos ? ` · devueltos: ${resumenPago.devueltos} (de verdad: ${fmtEUR(resumenPago.devueltoReal)})` : ""}
              {resumenPago.porDevolver ? ` · por devolver: ${resumenPago.porDevolver}` : ""}
            </Text>
          ) : null}

          {ventasOk && !loading ? (
            <Text nativeID="pedidos-en-tienda" style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
              Ventas en tienda (llegan de VeoAura) · {resumenTienda.total} ({fmtEUR(resumenTienda.importe)}) · en la cuenta del cliente:{" "}
              {resumenTienda.unidas} · pendientes de que se registre: {resumenTienda.pendientes}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
            {chips.map((c) => {
              const activo = filtro === c.value;
              return (
                <Pressable
                  key={c.value}
                  onPress={() => setFiltro(c.value)}
                  style={{
                    minHeight: TACTIL.minimo,
                    justifyContent: "center",
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: activo ? COLORS.accent : COLORS.border,
                    backgroundColor: activo ? COLORS.accent2 : "#FFFFFF",
                  }}
                >
                  <Text style={{ color: activo ? COLORS.accentDark : COLORS.text, fontWeight: "800", fontSize: 13 }}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Facturas (las emite VeoAura): recuento y filtro, que se suma al de arriba. */}
          {facturasOk && !loading ? (
            <View nativeID="pedidos-facturas" style={{ alignItems: "center", gap: 8 }}>
              <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
                Facturas de VeoAura · con factura: {resumenFacturas.con}
                {resumenFacturas.pdfPendiente ? ` (PDF pendiente: ${resumenFacturas.pdfPendiente})` : ""} · sin factura: {resumenFacturas.sin}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 8 }}>
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>Factura:</Text>
                {(
                  [
                    { value: "todas", label: "Todas" },
                    { value: "con", label: `Con factura (${resumenFacturas.con})` },
                    { value: "sin", label: `Sin factura (${resumenFacturas.sin})` },
                  ] as const
                ).map((c) => {
                  const activo = filtroFactura === c.value;
                  return (
                    <Pressable
                      key={c.value}
                      nativeID={`pedidos-filtro-factura-${c.value}`}
                      onPress={() => setFiltroFactura(c.value)}
                      style={{
                        minHeight: TACTIL.minimo,
                        justifyContent: "center",
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: activo ? COLORS.accent : COLORS.border,
                        backgroundColor: activo ? COLORS.accent2 : "#FFFFFF",
                      }}
                    >
                      <Text style={{ color: activo ? COLORS.accentDark : COLORS.text, fontWeight: "800", fontSize: 13 }}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {err ? (
            <Text style={{ color: COLORS.danger, fontWeight: "800", textAlign: "center" }}>{err}</Text>
          ) : null}

          {loading ? (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <CargaMarca texto="Cargando pedidos…" />
            </View>
          ) : visibles.length === 0 && !err ? (
            <Text style={{ color: COLORS.muted, textAlign: "center", marginTop: 20 }}>
              No hay pedidos en esta lista.
            </Text>
          ) : (
            visibles.map((p) => (
              <View
                key={p.id}
                style={{ gap: 8, alignItems: "center", paddingVertical: 16, borderTopWidth: 1, borderTopColor: COLORS.border }}
              >
                {/* La referencia (lo que ve el cliente) es el dato principal; el número interno, en pequeño. */}
                <Text nativeID={`pedido-titulo-${p.numero}`} selectable style={{ color: COLORS.text, fontWeight: "900", fontSize: 17, textAlign: "center" }}>
                  {p.codigo_seguimiento ? `Pedido ${p.codigo_seguimiento}` : `Pedido nº ${p.numero}`} · {fmtEUR(p.total_eur)}
                </Text>
                <Text style={{ color: COLORS.muted, textAlign: "center" }}>
                  {fmtFecha(p.created_at)} · {enTienda(p) ? "Compra en tienda" : p.entrega === "recogida" ? "Entrega en mano" : "Envío a domicilio"}
                </Text>
                {p.codigo_seguimiento ? (
                  <Text nativeID={`pedido-interno-${p.numero}`} style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, fontWeight: "700", textAlign: "center" }}>
                    Nº interno {p.numero}
                  </Text>
                ) : null}
                {enTienda(p) ? (
                  // Venta en mano de VeoAura: cómo se pagó y si ya está en la cuenta del cliente (o a quién espera).
                  <View nativeID={`pedido-tienda-${p.numero}`} style={{ alignItems: "center", gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                      <Ionicons name="storefront-outline" size={16} color="#15803D" />
                      <Text style={{ color: "#15803D", fontWeight: "800", textAlign: "center" }}>
                        En tienda · pagado{FORMA_PAGO_TIENDA[p.venta_forma_pago ?? ""] ? ` ${FORMA_PAGO_TIENDA[p.venta_forma_pago ?? ""]}` : ""} · entregado
                      </Text>
                    </View>
                    <Text nativeID={`pedido-tienda-cuenta-${p.numero}`} selectable style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
                      {p.user_id ? "Unida a la cuenta del cliente" : `Pendiente de que se registre ${p.email}`}
                    </Text>
                  </View>
                ) : p.codigo_seguimiento ? (
                  <EtiquetaNumero
                    codigo={p.codigo_seguimiento}
                    veoaura={!!p.id_veoaura}
                    enCuenta={!!p.user_id}
                    vinculadoEn={p.vinculado_en ?? null}
                    desdeChat={p.nota_admin === NOTA_ASIGNADO_CHAT}
                  />
                ) : null}

                {(p.pedido_items ?? []).map((it) => (
                  <Text key={it.id} style={{ color: COLORS.text, textAlign: "center" }}>
                    {it.titulo} · <Text style={{ color: COLORS.accentDark, fontWeight: "800" }}>{fmtEUR(it.precio_eur)}</Text>
                  </Text>
                ))}

                {/* Pago con tarjeta: lo apunta el servidor tras preguntárselo a Stripe. Solo texto con su icono, sin burbuja. */}
                {pagoOk && p.pago_estado ? (
                  <View nativeID={`pedido-pago-${p.numero}`} style={{ alignItems: "center", gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                      <Ionicons name={p.pago_estado === "pagado" ? "card" : "card-outline"} size={16} color={p.pago_estado === "pagado" ? "#15803D" : COLORS.muted} />
                      <Text style={{ color: p.pago_estado === "pagado" ? "#15803D" : COLORS.muted, fontWeight: "800", textAlign: "center" }}>
                        {p.pago_estado === "pagado"
                          ? `Pagado online${p.pago_metodo && METODO_PAGO[p.pago_metodo] ? ` con ${METODO_PAGO[p.pago_metodo]}` : ""} · ${fmtEUR(Number(p.pagado_eur ?? 0))}${p.pagado_en ? ` · ${fmtFecha(p.pagado_en)}` : ""}${p.pago_modo === "prueba" ? " · de prueba (sin cobro real)" : ""}`
                          : "Pago online empezado, sin terminar"}
                      </Text>
                    </View>
                    {p.devuelto_en ? (
                      <View nativeID={`pedido-devuelto-${p.numero}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                        <Ionicons name="return-down-back-outline" size={16} color={COLORS.muted} />
                        <Text style={{ color: COLORS.muted, fontWeight: "800", textAlign: "center" }}>
                          Devuelto · {fmtEUR(Number(p.devuelto_eur ?? 0))} · {fmtFecha(p.devuelto_en)}
                        </Text>
                      </View>
                    ) : p.pago_estado === "pagado" && p.estado === "cancelado" ? (
                      <Text style={{ color: COLORS.danger, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
                        Cancelado y pagado: devuelve el pago{devolucionOk ? " con el botón de abajo" : " desde Stripe"}.
                      </Text>
                    ) : p.pago_estado === "pagado" && Math.round(Number(p.pagado_eur ?? 0) * 100) !== Math.round(Number(p.total_eur) * 100) ? (
                      <Text style={{ color: COLORS.gold, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
                        El total ahora es {fmtEUR(p.total_eur)}: la diferencia se arregla desde Stripe o por el chat.
                      </Text>
                    ) : null}
                    {enlaceStripe(p) ? (
                      <Pressable
                        nativeID={`pedido-pago-stripe-${p.numero}`}
                        onPress={() => openExternalLink(enlaceStripe(p) as string)}
                        accessibilityRole="link"
                        style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.6 : 1 })}
                      >
                        <Ionicons name="open-outline" size={16} color={COLORS.accent} />
                        <Text style={{ color: COLORS.accentDark, fontWeight: "800" }}>Ver el pago en Stripe</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {/* Factura de VeoAura: número y «Descargar», «PDF pendiente» o «Sin factura». Texto con su icono, sin burbuja. */}
                {facturasOk ? (
                  <View nativeID={`pedido-factura-${p.numero}`} style={{ alignItems: "center", gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                      <Ionicons name="document-text-outline" size={16} color={facturas[p.id] ? COLORS.text : COLORS.muted} />
                      <Text style={{ color: facturas[p.id] ? COLORS.text : COLORS.muted, fontWeight: "800", textAlign: "center" }}>
                        {facturas[p.id] ? `Factura ${facturas[p.id].numero_factura ?? ""}${facturas[p.id].pdf ? "" : " · PDF pendiente"}` : "Sin factura"}
                      </Text>
                      {facturas[p.id]?.pdf ? (
                        <Pressable
                          nativeID={`pedido-factura-descargar-${p.numero}`}
                          onPress={() => descargarFactura(p)}
                          accessibilityRole="button"
                          accessibilityLabel={`Descargar la factura del pedido ${p.numero}`}
                          style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.6 : 1 })}
                        >
                          <Ionicons name="download-outline" size={16} color={COLORS.accent} />
                          <Text style={{ color: COLORS.accentDark, fontWeight: "800" }}>Descargar</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    {facturaMsg?.id === p.id ? (
                      <Text style={{ color: COLORS.danger, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>{facturaMsg.texto}</Text>
                    ) : null}
                  </View>
                ) : null}

                {/* Envío del pedido: automático (con la tarifa) o a mano para este pedido. (Una venta en mano no tiene envío.) */}
                {envioOk && !enTienda(p) ? (
                  <View nativeID={`pedido-envio-${p.numero}`} style={{ alignItems: "center", gap: 6 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "800", textAlign: "center" }}>
                      Artículos {fmtEUR(Number(p.productos_eur ?? p.total_eur))} · Envío {Number(p.envio_eur ?? 0) === 0 ? "gratis" : fmtEUR(Number(p.envio_eur))}
                      {nombreZona(p.zona_envio) ? ` (${nombreZona(p.zona_envio)})` : ""}
                      {p.peso_kg ? ` · ${fmtKg(p.peso_kg)}` : ""} · {p.envio_manual ? "a mano" : "automático"}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                      <TextInput
                        nativeID={`pedido-envio-campo-${p.numero}`}
                        value={envioEscrito[p.id] ?? ""}
                        onChangeText={(t) => setEnvioEscrito((e) => ({ ...e, [p.id]: t }))}
                        placeholder="Envío a mano (€)"
                        placeholderTextColor="rgba(11,33,56,0.35)"
                        keyboardType="decimal-pad"
                        accessibilityLabel={`Envío a mano del pedido ${p.numero}`}
                        style={{
                          width: 150,
                          minHeight: 44,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          paddingHorizontal: 10,
                          color: COLORS.text,
                          fontSize: 16,
                          fontWeight: "700",
                          textAlign: "center",
                        }}
                      />
                      {/* Guardar: solo el icono, sin burbuja (44 × 44). */}
                      <Pressable
                        nativeID={`pedido-envio-guardar-${p.numero}`}
                        disabled={guardando === p.id}
                        onPress={() => guardarEnvio(p, false)}
                        accessibilityRole="button"
                        accessibilityLabel={`Guardar el envío a mano del pedido ${p.numero}`}
                        style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: pressed || guardando === p.id ? 0.6 : 1 })}
                      >
                        <Ionicons name="checkmark-circle" size={28} color={COLORS.accent} />
                      </Pressable>
                      {p.envio_manual ? (
                        <Pressable
                          nativeID={`pedido-envio-automatico-${p.numero}`}
                          disabled={guardando === p.id}
                          onPress={() => guardarEnvio(p, true)}
                          accessibilityRole="button"
                          style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.6 : 1 })}
                        >
                          <Ionicons name="refresh-outline" size={18} color={COLORS.accent} />
                          <Text style={{ color: COLORS.accentDark, fontWeight: "800" }}>Volver al automático</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    {envioMsg?.id === p.id ? (
                      <Text nativeID={`pedido-envio-mensaje-${p.numero}`} style={{ color: envioMsg.tipo === "ok" ? "#15803D" : COLORS.danger, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
                        {envioMsg.texto}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                <Text style={{ color: COLORS.text, fontWeight: "800", textAlign: "center" }}>{p.nombre}</Text>
                <Text style={{ color: COLORS.muted, textAlign: "center" }}>
                  {/* Una venta en mano no guarda teléfono (solo el correo con el que se une a la cuenta). */}
                  {enTienda(p) ? p.email : `${p.telefono} · ${p.email}`}
                </Text>
                {p.entrega === "envio" && (p.direccion || p.ciudad) ? (
                  <Text style={{ color: COLORS.muted, textAlign: "center" }}>
                    {[p.direccion, [p.codigo_postal, p.ciudad].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                  </Text>
                ) : null}
                {p.notas ? (
                  <Text style={{ color: COLORS.muted, fontStyle: "italic", textAlign: "center" }}>“{p.notas}”</Text>
                ) : null}

                {/* Devolver el pago y cancelar el pedido (dueño, 2026-11-06): texto con su icono, sin burbuja; el primer
                    toque pide confirmar y el segundo lo hace. */}
                {!enTienda(p) && ((devolucionOk && p.pago_estado === "pagado" && !p.devuelto_en) || (p.estado !== "cancelado" && p.estado !== "entregado")) ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 18, rowGap: TACTIL.separacion }}>
                    {devolucionOk && p.pago_estado === "pagado" && !p.devuelto_en ? (
                      <Pressable
                        nativeID={`pedido-devolver-${p.numero}`}
                        disabled={guardando === p.id}
                        onPress={() => devolverPago(p)}
                        accessibilityRole="button"
                        style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed || guardando === p.id ? 0.6 : 1 })}
                      >
                        <Ionicons name="return-down-back-outline" size={18} color={COLORS.danger} />
                        <Text style={{ color: COLORS.danger, fontWeight: "800" }}>
                          {confirmando === `devolver:${p.id}` ? `Toca otra vez para devolver ${fmtEUR(Number(p.pagado_eur ?? 0))}` : "Devolver el pago"}
                        </Text>
                      </Pressable>
                    ) : null}
                    {p.estado !== "cancelado" && p.estado !== "entregado" ? (
                      <Pressable
                        nativeID={`pedido-cancelar-${p.numero}`}
                        disabled={guardando === p.id}
                        onPress={() => cancelarPedido(p)}
                        accessibilityRole="button"
                        style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed || guardando === p.id ? 0.6 : 1 })}
                      >
                        <Ionicons name="close-circle-outline" size={18} color={COLORS.danger} />
                        <Text style={{ color: COLORS.danger, fontWeight: "800" }}>
                          {confirmando === `cancelar:${p.id}` ? "Toca otra vez para cancelar el pedido" : "Cancelar pedido"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                {accionMsg?.id === p.id ? (
                  <Text nativeID={`pedido-accion-mensaje-${p.numero}`} style={{ color: accionMsg.tipo === "ok" ? "#15803D" : COLORS.danger, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
                    {accionMsg.texto}
                  </Text>
                ) : null}

                {/* Una venta en mano ya está pagada y entregada (la gestiona VeoAura): sin cambiar estado ni WhatsApp. */}
                {enTienda(p) ? null : (
                <>
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: TACTIL.separacion, marginTop: 4 }}>
                  {ESTADOS.map((e) => {
                    const activo = p.estado === e.value;
                    return (
                      <Pressable
                        key={e.value}
                        disabled={guardando === p.id}
                        onPress={() => cambiarEstado(p, e.value)}
                        style={{
                          minHeight: TACTIL.minimo,
                          justifyContent: "center",
                          paddingVertical: 6,
                          paddingHorizontal: 12,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: activo ? (e.value === "cancelado" ? COLORS.danger : COLORS.accent) : COLORS.border,
                          backgroundColor: activo ? (e.value === "cancelado" ? "#FFE4E6" : COLORS.accent2) : "#FFFFFF",
                          opacity: guardando === p.id ? 0.5 : 1,
                        }}
                      >
                        <Text
                          style={{
                            color: activo ? (e.value === "cancelado" ? COLORS.danger : COLORS.accentDark) : COLORS.muted,
                            fontWeight: "800",
                            fontSize: TAMANOS.minimo,
                          }}
                        >
                          {e.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  onPress={() => whatsapp(p)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.88 : 1,
                    marginTop: 4,
                    minHeight: TACTIL.minimo,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  })}
                >
                  <Ionicons name="logo-whatsapp" size={16} color={COLORS.text} />
                  <Text style={{ color: COLORS.text, fontWeight: "800" }}>Escribir al cliente</Text>
                </Pressable>
                </>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
