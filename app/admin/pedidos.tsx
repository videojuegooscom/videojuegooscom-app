/**
 * Archivo: app/admin/pedidos.tsx
 * Función: pantalla de administración «Pedidos», en la dirección /admin/pedidos (admite ?buscar=).
 * Para qué sirve: el administrador ve los pedidos que los clientes confirman en el checkout, su pago, entrega y valoraciones, y cambia su estado (pendiente, confirmado, preparado, enviado, entregado, cancelado con motivo).
 * Conectado con: lib/supabase.ts (tablas pedidos y pedido_items, función crear_pedido), lib/envio.ts, lib/interaccion.ts, lib/openExternalLink.ts, components/AvisosMovil.tsx, components/VentanaValoracion.tsx, components/marca/CargaMarca.tsx, constants/theme.ts; api/factura.ts y api/pago.ts.
 * Utilizado por: Expo Router (dirección /admin/pedidos, protegida por app/admin/_layout.tsx); la enlaza la tarjeta «Pedidos» de app/admin/index.tsx.
 * Dependencias: react, react-native.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: pantalla de administración "Pedidos". Lista los pedidos que los clientes
 * confirman en app/checkout.tsx, con sus artículos, el tipo de entrega y los datos de
 * contacto, y permite cambiar el estado (pendiente → confirmado → preparado → enviado →
 * entregado, o cancelado).
 *
 * DISEÑO (dueño, 2026-11-15: «lo veo todo muy confuso»; el mismo de Usuarios y participación, app/admin/users.tsx, con
 * los tamaños de constants/theme.ts: letra mínima 13, táctiles de 44 px, campos de 16 px):
 * 1) Arriba, «Avisos en este móvil · activos / no activos», plegable y discreto (components/AvisosMovil.tsx).
 * 2) El buscador (16 px; referencia VZ-…, número interno, nombre, correo o teléfono; ?buscar= en la URL).
 * 3) Cifras en tarjetas que filtran al tocarlas: Hoy, Por pagar, Por preparar, Reparto de hoy, Doble venta, Devueltos e
 *    Ingresos (30 días: pagados de verdad y no devueltos, de los 200 últimos pedidos).
 * 4) Pastillas de filtro (44 px) con su recuento: Todos, Por pagar, Pagados, Por preparar, Reparto de hoy (agrupado por
 *    mañana / tarde), Enviados, Cancelados, Doble venta y «Más filtros» (En curso, Hoy, cada estado, Devueltos, Sin cuenta,
 *    De VeoAura, Pagados online, Pago sin terminar, En tienda y Factura: todas / con / sin).
 * 5) Lista de filas compactas: referencia VZ-…, cliente y hora, importe, cómo pagó, entrega o franja y una etiqueta de
 *    estado de color (Pendiente, Pagado, Preparando, Enviado, Entregado, Cancelado, Devuelto, Doble venta); cancelados y
 *    devueltos en gris con «Devuelto X €». Al tocar una fila se despliega su detalle por bloques: Artículos · Pago ·
 *    Entrega · Cliente · Pasos · Valoración y, abajo, las acciones. «Abrir todos» los despliega a la vez; un aviso que abre
 *    ?buscar=VZ-… con un solo pedido lo enseña ya abierto.
 * 6) Abajo, «Más datos de los pedidos»: los recuentos de siempre (números de seguimiento, pago online, ventas en tienda,
 *    seguimiento, valoraciones, facturas, ingresos) y qué se manda a VeoAura al marcar «Entregado».
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
 * Desde la ficha del cliente (dueño, 2026-11-13): «Ver en Pedidos» abre esta pantalla con ?buscar=<correo> y el
 * buscador sale ya relleno con ese correo (solo sus pedidos); el botón de borrar lo vacía. Cada pedido con cuenta lleva
 * «Ver ficha del cliente» en su bloque «Cliente».
 *
 * Conectado con:
 * - app/admin/index.tsx → tarjeta "Pedidos" que lleva aquí.
 * - app/admin/cliente/[userId].tsx → «Ver en Pedidos» (parámetro ?buscar=) y «Ver ficha del cliente».
 * - app/admin/_layout.tsx → registra esta ruta ("pedidos") en el Stack.
 * - app/checkout.tsx → crea los pedidos con la función crear_pedido.
 * - api/escaparate-retorno.ts → al cambiar el estado se le avisa, por si el pedido lleva
 *   artículos de VeoAura (al cancelarlo, VeoAura los vuelve a poner a la venta).
 * - Números de seguimiento (migración 20261031170000): cada pedido enseña el suyo, si es una ficha
 *   creada en VeoAura (api/escaparate-veoaura.ts, evento «seguimiento») y si el cliente ya lo tiene
 *   en su cuenta; recuento abajo y filtros «Sin cuenta» y «De VeoAura».
 * - Envío (migración 20261104210000, dueño 2026-11-04): cada pedido enseña artículos, envío (con su
 *   zona) y total. El envío lo calcula la base de datos con las tarifas (Administración → Tarifas de
 *   envío); aquí se puede poner A MANO para ese pedido (queda «a mano» y ya no se recalcula) o
 *   devolverlo al automático. Sin la migración, no se enseña.
 * - Pago con tarjeta (Stripe, migración 20261105120000, dueño 2026-11-05; api/pago.ts): cada pedido enseña si se pagó
 *   con tarjeta (cuánto y cuándo, con su enlace a Stripe y si fue de prueba) o si el pago se empezó sin terminar;
 *   recuento abajo y filtros «Pagados online» y «Pago sin terminar». Lo apunta solo el servidor tras
 *   preguntárselo a Stripe. Si un pedido pagado se cancela o cambia de total, lo avisa (devolver desde Stripe). Sin la
 *   migración, no se enseña. Desde el 2026-11-11 (Bizum de Stripe, migración 20261111150000) cada pagado dice con qué se
 *   pagó («Pagado online con tarjeta / Bizum / Klarna», lo dice Stripe) y el recuento los cuenta por forma de
 *   pago; sin esa columna, todo sale como antes.
 * - Botones «Devolver el pago» y «Cancelar pedido» (dueño, 2026-11-06), con un segundo toque para confirmar. Devolver
 *   llama a api/pago.ts (solo el administrador; Stripe devuelve el pago entero una sola vez) y se ve «Devuelto · importe
 *   · fecha» (migración 20261106100000; sin ella no se ofrece). Un cancelado pagado sin devolver sigue en «En curso».
 * - Facturas (dueño, 2026-11-10; las emite VeoAura y llegan por api/escaparate-veoaura.ts, evento «factura»; migración
 *   20261110100000, tabla pedido_facturas): cada pedido enseña su número de factura y «Descargar» (api/factura.ts, la
 *   misma que usa el cliente en «Mis pedidos»), «PDF pendiente» o «Sin factura»; recuento abajo y filtro «Factura:
 *   todas / con factura / sin factura» (en «Más filtros»). Sin la migración, no se enseña.
 * - Referencia del pedido (dueño, 2026-11-11: «como una empresa profesional»): el título de cada pedido es su referencia
 *   «VZ-XXXX-XXXX» (codigo_seguimiento, la que ve el cliente) y el número interno va en su bloque «Cliente» («Nº
 *   interno 101»; sin referencia, «Pedido nº 101» como antes). El mensaje de WhatsApp que manda el administrador también
 *   nombra la referencia.
 * - Ventas en tienda (dueño, 2026-11-11; migración 20261111170000, pedidos.origen = 'tienda_fisica'): las ventas en mano
 *   que VeoAura manda con el evento «venta_tienda» (api/escaparate-veoaura.ts) salen como un pedido más con «En tienda ·
 *   pagado <forma> · entregado» y «Unida a la cuenta del cliente» o «Pendiente de que se registre <correo>»; recuento
 *   abajo (cuántas, importe, unidas y pendientes) y filtro «En tienda». Sin envío, teléfono, cambio de estado, cancelar ni
 *   WhatsApp (las gestiona VeoAura). Sin la migración, no se enseña nada de esto.
 * - Seguimiento paso a paso (mejora 5, 2026-11-14; migración 20261114160000): cada pedido enseña sus pasos con la fecha y
 *   la hora que guarda la base de datos (pedido_estados, la apunta un disparador al cambiar el estado; lo anterior, «sin
 *   hora») —lo mismo que ve el cliente en «Mis pedidos»— y, si va a domicilio, el campo «Nº de Correos o enlace» que le da
 *   al cliente «Seguir el envío». Recuento abajo (#pedidos-seguimiento). Sin la migración, pasos sin hora y sin el campo.
 * - Artículos únicos (dueño, 2026-11-15; migración 20261115200000_vendido_al_pagar): al pagar, api/pago.ts saca sus
 *   artículos de la venta. Un pedido cobrado con un artículo que ya estaba vendido dice «Artículo ya vendido: devuelve el
 *   pago» (#pedido-doble-venta-N), lleva la etiqueta «Doble venta» y sale en la cifra y el filtro «Doble venta (n)».
 *   Cancelado, sus artículos NO vuelven solos a la venta: «Volver a poner a la venta» (44 px, segundo toque para
 *   confirmar). Analítica cuenta las dobles ventas.
 * - Avisos en este móvil (dueño, 2026-11-15; migración 20261115110000_avisos_movil): línea plegable arriba
 *   (components/AvisosMovil.tsx) para activar en el móvil los avisos de cada pedido pagado o nuevo y de cada servicio
 *   pagado (api/pago.ts los manda); al tocar un aviso se abre esta pantalla con ?buscar=VZ-… (buscador relleno y el
 *   pedido ya desplegado).
 * - Valoración tras la entrega (mejora 11, 2026-11-15; migración 20261115100000): en cada pedido entregado, la nota del
 *   cliente con sus estrellas y su comentario (las bajas, 1-2, en rojo) o «Sin valorar» con cuándo se le pide (3 días
 *   tras «entregado»); recuento y media abajo (#pedidos-valoraciones). Sin la migración, nada.
 * - Franjas de entrega (dueño, 2026-11-15; migración 20261115180000): en cada fila, el día y la franja que eligió el
 *   cliente (#pedido-franja-N) y el filtro «Reparto de hoy» (los de hoy sin entregar ni cancelar), agrupado por franja
 *   (mañana / tarde) para planificar la ruta. Sin la migración, nada.
 * - Motivo de la cancelación y «Avisarme cuando haya otro» (dueño, 2026-11-16; migración 20261116100000): al primer toque
 *   de «Cancelar pedido» (o de la pastilla de estado «Cancelado») salen los motivos en pastillas («El artículo ya no se
 *   encuentra disponible», «No hemos podido confirmar el pago», «Lo has pedido tú» y «Otro motivo» con texto de hasta 200
 *   letras). El motivo es OBLIGATORIO (dueño, 2026-11-16): sin elegir ninguno (o con «Otro motivo» sin texto) el botón de
 *   confirmar no se puede pulsar; el segundo toque cancela y guarda el motivo (pedidos.cancelacion_motivo; cancelado_en lo
 *   pone la base de datos). El bloque «Cancelación» del detalle enseña el motivo y si el cliente pidió aviso y por qué canal
 *   (avisos_reposicion; con correo, «Correo pendiente de activar en la tienda»: aún no hay envío de correos propio). En un
 *   pedido ya cancelado, «Añadir motivo» / «Cambiar motivo» guarda SOLO cancelacion_motivo (mismo update de pedidos que al
 *   cancelar, regla pedidos_admin_update; no toca el estado, el pago ni cancelado_en). Los cancelados sin motivo llevan la
 *   etiqueta «Sin motivo» en la lista y la pastilla «Cancelados sin motivo (N)» para completarlos. Recuento abajo
 *   (#pedidos-avisos-reposicion). Sin la migración, se cancela como antes.
 * - pruebas/perfil-datos.mjs → sección PEDRED (este diseño) y P, Q, VA, TE, PT, FA, VT, FCH, TM4, SEGP, VALOR, AVISOM,
 *   FRANJ, VENDP y CANCAV.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StatusBar, Text, TextInput, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { abrirDescarga, openExternalLink } from "../../lib/openExternalLink";
import { supabase } from "../../lib/supabase";
import { MOTIVO_MAX, MOTIVO_NO_DISPONIBLE, MOTIVOS_CANCELACION, motivoParaCliente, type CanalReposicion } from "../../lib/interaccion";
import {
  cargarAjustesFranjas,
  cargarSeguimientoPedidos,
  cargarTarifas,
  cobradoDeVerdad,
  enlaceSeguimientoEnvio,
  importeCobrado,
  fechaCortaEntrega,
  fechaHoyMadrid,
  nombreFranja,
  fechaHoraPaso,
  fmtKg,
  pasosDelPedido,
  type HistorialPedidos,
  type ZonaEnvio,
} from "../../lib/envio";
import CargaMarca from "../../components/marca/CargaMarca";
import AvisosMovil from "../../components/AvisosMovil";
import { ValoracionPedidoAdmin, cargarValoracionesPedidos, entregadoEnDe, type ValoracionPedido } from "../../components/VentanaValoracion";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/theme";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];
type Ancho = number | `${number}%`;

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
  // Franja de la entrega en el mismo día que eligió el cliente (migración 20261115180000).
  entrega_franja?: "manana" | "tarde" | null;
  entrega_fecha?: string | null;
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
  // Doble venta (migración 20261115200000_vendido_al_pagar): se cobró con un artículo que ya estaba vendido.
  doble_venta_en?: string | null;
  // Motivo y hora de la cancelación (migración 20261116100000_cancelacion_motivo_aviso; puede no existir aún).
  cancelacion_motivo?: string | null;
  cancelado_en?: string | null;
};

// Estado de venta de cada artículo de los pedidos (products): cada artículo es UNA unidad. vendido_pedido_id solo existe
// con la migración 20261115200000 (sin ella, no viene).
type ArticuloEstado = { id: string; is_active: boolean | null; vendido_en: string | null; vendido_pedido_id?: string | null };

// «Avisarme cuando haya otro» que pidió el cliente de un pedido cancelado (avisos_reposicion, migración 20261116100000).
type AvisoRepoAdmin = { id: string; pedido_id: string; texto: string; canal: CanalReposicion; activo: boolean; avisado_en: string | null };
const CANAL_ADMIN: Record<CanalReposicion, string> = { app: "en la app", correo: "por correo", ambas: "en la app y por correo" };
const OTRO_MOTIVO = "otro";

// Filtros: los de la fila principal y los de «Más filtros».
type Filtro =
  | "todos"
  | "por_pagar"
  | "pagados"
  | "por_preparar"
  | "reparto_hoy"
  | "enviados"
  | "cancelados"
  | "cancelados_sin_motivo"
  | "doble_venta"
  | "activos"
  | "hoy"
  | Exclude<Estado, "enviado" | "cancelado">
  | "devueltos"
  | "sin_vincular"
  | "veoaura"
  | "pagados_tarjeta"
  | "pago_sin_terminar"
  | "en_tienda";

// Cómo se pagó una venta en mano (lo dice VeoAura).
const FORMA_PAGO_TIENDA: Record<string, string> = { efectivo: "en efectivo", tarjeta: "con tarjeta", bizum: "con Bizum", transferencia: "por transferencia", otro: "" };
const FORMA_CORTA_TIENDA: Record<string, string> = { efectivo: "efectivo", tarjeta: "tarjeta", bizum: "Bizum", transferencia: "transferencia", otro: "" };
const enTienda = (p: Pedido) => p.origen === "tienda_fisica";

// Nombre de la forma de pago online (tarjeta, Bizum o Klarna), si Stripe la dijo.
const METODO_PAGO: Record<string, string> = { card: "tarjeta", bizum: "Bizum", klarna: "Klarna" };
const METODO_CORTO: Record<string, string> = { card: "Tarjeta", bizum: "Bizum", klarna: "Klarna" };

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

// Mismos colores que Usuarios y la ficha del cliente; grises nunca más claros que 0,72 y el azul de texto (#0A78B4) en la
// letra azul de menos de 17 px (el de marca, en iconos, bordes y fondos).
const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  border: "#E3EAF2",
  text: COLORES_TEXTO.texto,
  muted: COLORES_TEXTO.secundario,
  accent: COLORES_TEXTO.azulMarca,
  // Texto azul de menos de 17 px (enlaces, precios, filtros): azul oscuro; el de marca queda para iconos y bordes.
  accentDark: COLORES_TEXTO.azulTexto,
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  success: "#15803D",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  gold: "#B8860B",
};

// Etiqueta de estado de cada fila: texto y colores (texto oscuro sobre fondo claro, 4,5:1 o más).
const ETIQUETAS: Record<string, { texto: string; color: string; fondo: string }> = {
  pendiente: { texto: "Pendiente", color: "#92400E", fondo: "#FEF3C7" },
  pagado: { texto: "Pagado", color: "#166534", fondo: "#DCFCE7" },
  preparando: { texto: "Preparando", color: COLORES_TEXTO.azulTexto, fondo: "#E0F2FE" },
  enviado: { texto: "Enviado", color: "#3730A3", fondo: "#E0E7FF" },
  entregado: { texto: "Entregado", color: "#115E59", fondo: "#CCFBF1" },
  cancelado: { texto: "Cancelado", color: COLORES_TEXTO.secundario, fondo: "#EEF2F6" },
  devuelto: { texto: "Devuelto", color: COLORES_TEXTO.secundario, fondo: "#EEF2F6" },
  doble: { texto: "Doble venta", color: "#B91C1C", fondo: "#FFE4E6" },
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

const TREINTA_DIAS = 30 * 86_400_000;

// Pagado online (Stripe).
const pagadoOnline = (p: Pedido) => p.pago_estado === "pagado";
// Pagado: online o en tienda, y sin devolver.
const estaPagado = (p: Pedido) => (pagadoOnline(p) || enTienda(p)) && !p.devuelto_en;
// Por pagar: web, sin cancelar ni entregar y sin pago online (se acuerda por el chat o se paga en la entrega).
const porPagar = (p: Pedido) => !enTienda(p) && p.estado !== "cancelado" && p.estado !== "entregado" && !pagadoOnline(p);
// Por preparar: pagado online (o confirmado tras acordar el pago) y aún pendiente o confirmado; sin las dobles ventas.
const porPreparar = (p: Pedido) =>
  !enTienda(p) && (p.estado === "pendiente" || p.estado === "confirmado") && (pagadoOnline(p) || p.estado === "confirmado") && !p.doble_venta_en;
// Hay que devolver el pago: pagado online, sin devolver y cancelado o con un artículo que ya estaba vendido.
const faltaDevolver = (p: Pedido) => pagadoOnline(p) && !p.devuelto_en && (p.estado === "cancelado" || !!p.doble_venta_en);
// Cancelado desde la web sin motivo guardado (los de antes del motivo o cancelados sin elegirlo): el cliente no ve por qué.
const sinMotivo = (p: Pedido) => p.estado === "cancelado" && !enTienda(p) && !(p.cancelacion_motivo ?? "").trim();
// En gris: cancelados y devueltos.
const apagado = (p: Pedido) => p.estado === "cancelado" || !!p.devuelto_en;
// Dinero de verdad (Ingresos): cobradoDeVerdad e importeCobrado de lib/envio.ts (pagado online de verdad, venta en tienda
// o entregado; sin pruebas, cancelados, dobles ventas ni devueltos). La misma regla cuenta lo gastado en Usuarios.

function etiquetaEstado(p: Pedido) {
  if (p.devuelto_en) return ETIQUETAS.devuelto;
  if (p.doble_venta_en) return ETIQUETAS.doble;
  if (p.estado === "cancelado") return ETIQUETAS.cancelado;
  if (p.estado === "entregado") return ETIQUETAS.entregado;
  if (p.estado === "enviado") return ETIQUETAS.enviado;
  if (p.estado === "confirmado" || p.estado === "preparado") return ETIQUETAS.preparando;
  return pagadoOnline(p) ? ETIQUETAS.pagado : ETIQUETAS.pendiente;
}

// Cómo pagó (fila compacta): forma de pago online, en tienda, sin terminar o sin pagar.
function comoPago(p: Pedido): { texto: string; icono: IoniconName; color: string } {
  if (enTienda(p)) {
    const f = FORMA_CORTA_TIENDA[p.venta_forma_pago ?? ""];
    return { texto: `En tienda${f ? ` · ${f}` : ""}`, icono: "storefront-outline", color: COLORS.text };
  }
  if (pagadoOnline(p)) {
    return { texto: `${METODO_CORTO[p.pago_metodo ?? ""] ?? "Pago online"}${p.pago_modo === "prueba" ? " (prueba)" : ""}`, icono: "card-outline", color: COLORS.text };
  }
  if (p.pago_estado === "iniciado") return { texto: "Pago sin terminar", icono: "time-outline", color: COLORS.muted };
  if (p.estado === "entregado") return { texto: "Pago en la entrega", icono: "cash-outline", color: COLORS.text };
  return { texto: "Sin pagar", icono: "wallet-outline", color: COLORS.muted };
}

// Un filtro (o un desplegable, con su flecha). 44 px de alto. Igual que en Usuarios.
function Chip({
  label,
  onPress,
  activo,
  abierto,
  desplegable,
  nativeID,
}: {
  label: string;
  onPress: () => void;
  activo?: boolean;
  abierto?: boolean;
  desplegable?: boolean;
  nativeID?: string;
}) {
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!activo, expanded: desplegable ? !!abierto : undefined }}
      style={({ pressed }) => ({
        minHeight: TACTIL.minimo,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: activo || abierto ? COLORS.accent : COLORS.border,
        backgroundColor: activo ? COLORS.accent2 : COLORS.bg,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: activo ? "900" : "800", fontSize: TAMANOS.minimo }}>{label}</Text>
      {desplegable ? <Ionicons name={abierto ? "chevron-up" : "chevron-down"} size={16} color={COLORS.text} /> : null}
    </Pressable>
  );
}

// Una cifra: el número grande y su etiqueta debajo (como en Usuarios). Al tocarla, filtra la lista.
function Cifra({
  valor,
  etiqueta,
  nativeID,
  onPress,
  activa,
  icono,
  ancho,
  alerta,
}: {
  valor: string;
  etiqueta: string;
  nativeID?: string;
  onPress?: () => void;
  activa?: boolean;
  icono?: IoniconName;
  ancho: Ancho;
  alerta?: boolean;
}) {
  const estilo = {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: ancho,
    minWidth: 0,
    minHeight: 72,
    borderRadius: 16,
    backgroundColor: activa ? COLORS.accent2 : alerta ? COLORS.dangerBg : COLORS.card,
    borderWidth: 1,
    borderColor: activa ? COLORS.accentBorder : alerta ? COLORS.dangerBg : COLORS.card,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 2,
  };
  const contenido = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" }}>
        {icono ? <Ionicons name={icono} size={18} color={alerta ? COLORS.danger : COLORS.accent} /> : null}
        <Text numberOfLines={1} style={{ color: alerta ? COLORS.danger : COLORS.text, fontWeight: "900", fontSize: TAMANOS.titulo3, flexShrink: 1 }}>
          {valor}
        </Text>
      </View>
      <Text
        numberOfLines={2}
        style={{ color: activa ? COLORS.accentDark : alerta ? COLORS.danger : COLORS.muted, fontWeight: activa ? "900" : "700", fontSize: TAMANOS.minimo, lineHeight: 17, textAlign: "center" }}
      >
        {etiqueta}
      </Text>
    </>
  );
  if (!onPress) {
    return (
      <View nativeID={nativeID} style={estilo}>
        {contenido}
      </View>
    );
  }
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!activa }}
      accessibilityLabel={`${valor} ${etiqueta}`}
      style={({ pressed }) => ({ ...estilo, opacity: pressed ? 0.8 : 1 })}
    >
      {contenido}
    </Pressable>
  );
}

// Una sección: icono y título (sin recuadro), como en Usuarios.
function Seccion({ icon, title, extra, nativeID, children }: { icon: IoniconName; title: string; extra?: string; nativeID?: string; children: React.ReactNode }) {
  return (
    <View nativeID={nativeID} style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Ionicons name={icon} size={20} color={COLORS.accent} />
        <Text style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.destacado }}>{title}</Text>
        {extra ? <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, fontWeight: "800" }}>{extra}</Text> : null}
      </View>
      {children}
    </View>
  );
}

// Línea de detalle (13 px, gris permitido).
function Detalle({ children, nativeID, color }: { children: React.ReactNode; nativeID?: string; color?: string }) {
  return (
    <Text nativeID={nativeID} style={{ color: color ?? COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
      {children}
    </Text>
  );
}

// Una etiqueta pequeña de la fila: icono y texto con su color, sin cápsula (como en Usuarios).
function Etiqueta({ icon, texto, color, nativeID }: { icon: IoniconName; texto: string; color: string; nativeID?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" }}>
      <Ionicons name={icon} size={15} color={color === COLORS.text ? COLORS.accent : color} />
      <Text nativeID={nativeID} style={{ color, fontWeight: "800", fontSize: TAMANOS.minimo, flexShrink: 1 }}>
        {texto}
      </Text>
    </View>
  );
}

// La etiqueta de estado de color (Pendiente, Pagado, Preparando, Enviado, Entregado, Cancelado, Devuelto, Doble venta).
function EtiquetaEstado({ p }: { p: Pedido }) {
  const e = etiquetaEstado(p);
  return (
    <View nativeID={`pedido-estado-etiqueta-${p.numero}`} style={{ borderRadius: 999, backgroundColor: e.fondo, paddingHorizontal: 9, paddingVertical: 2 }}>
      <Text style={{ color: e.color, fontWeight: "900", fontSize: TAMANOS.minimo, lineHeight: 18 }}>{e.texto}</Text>
    </View>
  );
}

// Un bloque del detalle (Artículos, Pago, Entrega, Cliente, Pasos, Valoración): título con su icono y su contenido.
function Bloque({ icono, titulo, nativeID, ancho, children }: { icono: IoniconName; titulo: string; nativeID?: string; ancho: Ancho; children: React.ReactNode }) {
  return (
    <View nativeID={nativeID} style={{ flexGrow: 1, flexShrink: 1, flexBasis: ancho, minWidth: 0, borderRadius: 16, backgroundColor: COLORS.card, padding: 12, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name={icono} size={18} color={COLORS.accent} />
        <Text style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>{titulo}</Text>
      </View>
      {children}
    </View>
  );
}

// Un enlace o acción de texto con su icono, sin burbuja (44 px de alto).
function AccionTexto({
  nativeID,
  icono,
  texto,
  onPress,
  color = COLORS.accentDark,
  colorIcono,
  disabled,
  rol = "button",
  etiqueta,
}: {
  nativeID?: string;
  icono: IoniconName;
  texto: string;
  onPress: () => void;
  color?: string;
  colorIcono?: string;
  disabled?: boolean;
  rol?: "button" | "link";
  etiqueta?: string;
}) {
  return (
    <Pressable
      nativeID={nativeID}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole={rol}
      accessibilityLabel={etiqueta}
      style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed || disabled ? 0.6 : 1 })}
    >
      <Ionicons name={icono} size={18} color={colorIcono ?? (color === COLORS.accentDark ? COLORS.accent : color)} />
      <Text style={{ color, fontWeight: "800", fontSize: TAMANOS.cuerpo, flexShrink: 1 }}>{texto}</Text>
    </Pressable>
  );
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
    <Text accessibilityLabel={`Referencia ${codigo}`} style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 18 }}>
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
  );
}

const estiloCampo = {
  minHeight: TACTIL.minimo,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: COLORS.border,
  backgroundColor: COLORS.bg,
  paddingHorizontal: 12,
  color: COLORS.text,
  fontSize: CAMPO.letra,
  fontWeight: "700" as const,
};

export default function PedidosAdmin() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMobile = (Number.isFinite(width) && width > 0 ? width : 390) < 700;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  // «Más filtros» (los de siempre que no van en la fila principal) desplegado.
  const [masFiltros, setMasFiltros] = useState(false);
  // Pedidos desplegados (detalle por bloques) y «Abrir todos».
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set());
  const [todosAbiertos, setTodosAbiertos] = useState(false);
  // false = aún no existe doble_venta_en (migración 20261115200000 sin aplicar): ni aviso ni filtro.
  const [dobleOk, setDobleOk] = useState(false);
  // false = aún no existe el motivo de cancelación (migración 20261116100000 sin aplicar): se cancela como antes.
  const [cancelacionOk, setCancelacionOk] = useState(false);
  // Motivo elegido al cancelar cada pedido (sin elegir, no se puede confirmar) y el texto de «Otro motivo». Clave: el id
  // del pedido al cancelar y `editar:<id>` al añadir o cambiar el motivo de uno ya cancelado.
  const [motivoElegido, setMotivoElegido] = useState<Record<string, string>>({});
  const [motivoOtro, setMotivoOtro] = useState<Record<string, string>>({});
  // Pedido cancelado con el editor de «Añadir motivo» / «Cambiar motivo» abierto.
  const [editandoMotivo, setEditandoMotivo] = useState<string | null>(null);
  const [motivoMsg, setMotivoMsg] = useState<{ id: string; tipo: "ok" | "error"; texto: string } | null>(null);
  // Avisos de reposición que pidieron los clientes (null sin la tabla).
  const [avisosRepo, setAvisosRepo] = useState<AvisoRepoAdmin[] | null>(null);
  // Artículos de los pedidos cargados (para «Volver a poner a la venta» tras cancelar uno pagado).
  const [articulos, setArticulos] = useState<Record<string, ArticuloEstado>>({});
  // false = la franja de entrega aún no existe (migración 20261115180000 sin aplicar): ni filtro ni franja.
  const [franjaOk, setFranjaOk] = useState(false);
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
  // Seguimiento paso a paso (mejora 5, migración 20261114160000): hora de cada cambio de estado y número de envío. null =
  // la migración aún no está aplicada: pasos sin hora y sin el campo del número.
  const [historial, setHistorial] = useState<HistorialPedidos | null>(null);
  // Valoración de cada pedido entregado (pedido_valoraciones; null sin la migración).
  const [valoraciones, setValoraciones] = useState<Record<string, ValoracionPedido> | null>(null);
  const [numerosEnvio, setNumerosEnvio] = useState<Record<string, string>>({});
  const [numeroEscrito, setNumeroEscrito] = useState<Record<string, string>>({});
  const [numeroMsg, setNumeroMsg] = useState<{ id: string; tipo: "ok" | "error"; texto: string } | null>(null);
  // Buscador: referencia VZ-…, número interno, nombre, correo o teléfono (dueño, 2026-11-11).
  // Desde la ficha del cliente («Ver en Pedidos») llega ?buscar=<correo>: el buscador sale relleno (y se puede borrar).
  const { buscar } = useLocalSearchParams<{ buscar?: string }>();
  const buscarUrl = typeof buscar === "string" ? buscar.slice(0, 200) : "";
  const [busqueda, setBusqueda] = useState(buscarUrl);
  useEffect(() => {
    if (buscarUrl) setBusqueda(buscarUrl);
  }, [buscarUrl]);

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
    // Franja de entrega elegida al pagar (migración 20261115180000).
    const FRANJA = ",entrega_franja,entrega_fecha";
    // Doble venta de un artículo único (migración 20261115200000).
    const DOBLE = ",doble_venta_en";
    // Motivo y hora de la cancelación (migración 20261116100000).
    const CANCELACION = ",cancelacion_motivo,cancelado_en";
    let conCancelacion = true;
    let conDoble = true;
    let conFranja = true;
    let conVenta = true;
    let conMetodo = true;
    let conDevolucion = true;
    let conPago = true;
    let conEnvio = true;
    let conNumeros = true;
    const columnas = () =>
      `${base}${conNumeros ? NUMEROS : ""}${conEnvio ? ENVIO : ""}${conPago ? PAGO : ""}${conPago && conDevolucion ? DEVOLUCION : ""}${conPago && conMetodo ? METODO : ""}${conVenta ? VENTA : ""}${conFranja ? FRANJA : ""}${conDoble ? DOBLE : ""}${conCancelacion ? CANCELACION : ""}`;
    let res: { data: unknown[] | null; error: { code?: string; message?: string } | null } = await consulta(columnas());
    for (let vuelta = 0; vuelta < 9 && res.error; vuelta++) {
      const msg = String(res.error.message ?? "");
      if (conCancelacion && /cancelacion_motivo|cancelado_en/.test(msg)) conCancelacion = false;
      else if (conDoble && /doble_venta_en/.test(msg)) conDoble = false;
      else if (conFranja && /entrega_franja|entrega_fecha/.test(msg)) conFranja = false;
      else if (conVenta && /origen|veoaura_venta_id|venta_forma_pago/.test(msg)) conVenta = false;
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
    setFranjaOk(!res.error && conFranja);
    setDobleOk(!res.error && conDoble);
    setCancelacionOk(!res.error && conCancelacion);
    if (conFranja) cargarAjustesFranjas();
    // «Avisarme cuando haya otro» (avisos_reposicion; el administrador las lee todas): por pedido y los recuentos. Sin la
    // tabla, null (no se enseña nada).
    if (conCancelacion) {
      supabase
        .from("avisos_reposicion")
        .select("id,pedido_id,texto,canal,activo,avisado_en")
        .order("creado_en", { ascending: false })
        .limit(1000)
        .then(({ data: av, error: errAv }) => setAvisosRepo(errAv || !Array.isArray(av) ? null : (av as AvisoRepoAdmin[])));
    } else setAvisosRepo(null);
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
      // Estado de venta de sus artículos (consulta aparte; sin vendido_pedido_id, sin él; si falla, sin botón).
      const idsArticulos = [...new Set(lista.flatMap((p) => (p.pedido_items ?? []).map((it) => it.product_id)).filter((x): x is string => !!x))];
      if (idsArticulos.length) {
        let art: { data: unknown; error: { message?: string } | null } = await supabase.from("products").select("id,is_active,vendido_en,vendido_pedido_id").in("id", idsArticulos);
        if (art.error && /vendido_pedido_id/.test(String(art.error.message ?? ""))) art = await supabase.from("products").select("id,is_active,vendido_en").in("id", idsArticulos);
        setArticulos(art.error || !Array.isArray(art.data) ? {} : Object.fromEntries((art.data as ArticuloEstado[]).map((a) => [a.id, a])));
      } else setArticulos({});
      // Pasos con su hora y número de envío (consulta aparte; sin la migración, sin horas y sin fallar).
      cargarSeguimientoPedidos(lista.filter((p) => !enTienda(p)).map((p) => p.id)).then((seg) => {
        setHistorial(seg.historial);
        setNumerosEnvio(seg.numeros);
      });
      // Valoración tras la entrega (mejora 11; consulta aparte de los entregados; sin la migración, null y no sale nada).
      const entregados = lista.filter((p) => p.estado === "entregado").map((p) => p.id);
      if (entregados.length) cargarValoracionesPedidos(entregados).then(setValoraciones);
      else setValoraciones({});
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

  const hoy = fechaHoyMadrid();

  const repartoDeHoy = useMemo(() => {
    const orden = (p: Pedido) => (p.entrega_franja === "manana" ? 0 : 1);
    return pedidos
      .filter((p) => p.entrega_fecha === hoy && !!p.entrega_franja && p.estado !== "cancelado" && p.estado !== "entregado")
      .sort((a, b) => orden(a) - orden(b) || a.numero - b.numero);
  }, [pedidos, hoy]);

  // Las cifras de arriba (y los recuentos de las pastillas).
  const cuentas = useMemo(() => {
    const desde = Date.now() - TREINTA_DIAS;
    const cobrados30 = pedidos.filter((p) => cobradoDeVerdad(p) && Date.parse(p.pagado_en ?? p.created_at) >= desde);
    return {
      todos: pedidos.length,
      hoy: pedidos.filter((p) => fechaHoyMadrid(new Date(p.created_at)) === hoy).length,
      porPagar: pedidos.filter(porPagar).length,
      pagados: pedidos.filter(estaPagado).length,
      porPreparar: pedidos.filter(porPreparar).length,
      enviados: pedidos.filter((p) => p.estado === "enviado").length,
      cancelados: pedidos.filter((p) => p.estado === "cancelado").length,
      sinMotivo: pedidos.filter(sinMotivo).length,
      doble: pedidos.filter((p) => !!p.doble_venta_en).length,
      dobleSinDevolver: pedidos.filter((p) => !!p.doble_venta_en && !p.devuelto_en).length,
      devueltos: pedidos.filter((p) => !!p.devuelto_en).length,
      ingresos30: cobrados30.reduce((a, p) => a + importeCobrado(p), 0),
      cobrados30: cobrados30.length,
    };
  }, [pedidos, hoy]);

  const visiblesPorEstado = useMemo(() => {
    switch (filtro) {
      case "todos":
        return pedidos;
      // En curso: también los cancelados que siguen pagados con tarjeta sin devolver (falta devolver el pago).
      case "activos":
        return pedidos.filter((p) => p.estado !== "entregado" && (p.estado !== "cancelado" || (p.pago_estado === "pagado" && !p.devuelto_en)));
      case "hoy":
        return pedidos.filter((p) => fechaHoyMadrid(new Date(p.created_at)) === hoy);
      case "por_pagar":
        return pedidos.filter(porPagar);
      case "pagados":
        return pedidos.filter(estaPagado);
      case "por_preparar":
        return pedidos.filter(porPreparar);
      case "enviados":
        return pedidos.filter((p) => p.estado === "enviado");
      case "cancelados":
        return pedidos.filter((p) => p.estado === "cancelado");
      // Cancelados sin motivo: para que el dueño los complete (el cliente no ve por qué se canceló). El que se acaba de
      // completar se queda a la vista con su «Motivo guardado» hasta cambiar de filtro.
      case "cancelados_sin_motivo":
        return pedidos.filter((p) => sinMotivo(p) || motivoMsg?.id === p.id);
      case "devueltos":
        return pedidos.filter((p) => !!p.devuelto_en);
      case "sin_vincular":
        return pedidos.filter((p) => !p.user_id);
      case "veoaura":
        return pedidos.filter((p) => !!p.id_veoaura);
      case "pagados_tarjeta":
        return pedidos.filter((p) => p.pago_estado === "pagado");
      case "pago_sin_terminar":
        return pedidos.filter((p) => p.pago_estado === "iniciado");
      case "en_tienda":
        return pedidos.filter(enTienda);
      // Reparto de hoy: los de hoy (fecha de Madrid) sin cancelar ni entregar, primero la mañana y luego la tarde.
      case "reparto_hoy":
        return repartoDeHoy;
      // Doble venta: cobrados con un artículo que ya estaba vendido (hay que devolver el pago).
      case "doble_venta":
        return pedidos.filter((p) => !!p.doble_venta_en);
      default:
        return pedidos.filter((p) => p.estado === filtro);
    }
  }, [pedidos, filtro, repartoDeHoy, hoy, motivoMsg]);

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

  // Un aviso al móvil abre ?buscar=VZ-…: si sale un solo pedido, se enseña ya desplegado (una vez).
  const autoAbierto = useRef(false);
  useEffect(() => {
    if (loading || autoAbierto.current || !buscarUrl || busqueda !== buscarUrl || visibles.length !== 1) return;
    autoAbierto.current = true;
    const id = visibles[0].id;
    setAbiertos((prev) => new Set(prev).add(id));
  }, [loading, buscarUrl, busqueda, visibles]);

  const estaAbierto = (id: string) => todosAbiertos || abiertos.has(id);
  const todosVisiblesAbiertos = visibles.length > 0 && visibles.every((p) => estaAbierto(p.id));
  function alternar(id: string) {
    if (todosAbiertos) {
      setTodosAbiertos(false);
      setAbiertos(new Set(pedidos.map((p) => p.id).filter((x) => x !== id)));
      return;
    }
    setAbiertos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function abrirOCerrarTodos() {
    if (todosVisiblesAbiertos) {
      setTodosAbiertos(false);
      setAbiertos(new Set());
    } else setTodosAbiertos(true);
  }
  // Elegir un filtro (pastilla o cifra) vacía el buscador: con algo escrito se busca en todos y el filtro no se notaría.
  function elegirFiltro(f: Filtro) {
    setFiltro(f);
    if (busqueda) setBusqueda("");
  }

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

  // extra: el motivo de la cancelación (solo con la migración 20261116100000). Devuelve si se guardó.
  async function cambiarEstado(p: Pedido, estado: Estado, extra?: { cancelacion_motivo: string | null }): Promise<boolean> {
    if (p.estado === estado) return false;
    setGuardando(p.id);
    const { error } = await supabase.from("pedidos").update({ estado, ...(extra ?? {}) }).eq("id", p.id);
    if (error) {
      setErr("No se pudo cambiar el estado del pedido.");
    } else {
      const ahora = new Date().toISOString();
      setPedidos((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, estado, ...(extra ?? {}), ...(estado === "cancelado" && cancelacionOk ? { cancelado_en: ahora } : {}) } : x))
      );
      // La hora del paso la pone la base de datos (pedido_estados): se relee la de este pedido.
      if (historial) {
        cargarSeguimientoPedidos([p.id]).then((seg) => {
          if (seg.historial) setHistorial((h) => ({ ...(h ?? {}), [p.id]: seg.historial?.[p.id] ?? [] }));
        });
      }
      // Si se cancela un pedido con artículos de VeoAura, el servidor se lo avisa a VeoAura
      // (api/escaparate-retorno.ts). No se espera.
      if (Platform.OS === "web") fetch("/api/escaparate-retorno", { method: "POST" }).catch(() => {});
    }
    setGuardando(null);
    return !error;
  }

  // Número de envío (Correos) o enlace del transportista: el cliente ve «Seguir el envío». Vacío lo quita.
  async function guardarNumeroEnvio(p: Pedido) {
    // Un número de Correos va en mayúsculas; un enlace, tal cual.
    const escrito = (numeroEscrito[p.id] ?? numerosEnvio[p.id] ?? "").trim();
    const texto = /^https:\/\//i.test(escrito) ? escrito : escrito.toUpperCase();
    if (texto && !enlaceSeguimientoEnvio(texto)) {
      setNumeroMsg({ id: p.id, tipo: "error", texto: "Escribe el número de Correos (letras y cifras) o un enlace que empiece por https://." });
      return;
    }
    setGuardando(p.id);
    setNumeroMsg(null);
    const { error } = await supabase.from("pedidos").update({ envio_seguimiento: texto || null }).eq("id", p.id);
    if (error) {
      setNumeroMsg({ id: p.id, tipo: "error", texto: "No se pudo guardar el número de envío." });
    } else {
      setNumerosEnvio((n) => {
        const copia = { ...n };
        if (texto) copia[p.id] = texto;
        else delete copia[p.id];
        return copia;
      });
      setNumeroEscrito((e) => ({ ...e, [p.id]: texto }));
      setNumeroMsg({ id: p.id, tipo: "ok", texto: texto ? "Número guardado: el cliente ya ve «Seguir el envío»." : "Número quitado." });
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

  // El motivo que verá el cliente: el elegido en las pastillas o el texto de «Otro motivo» (2 letras como mínimo, como
  // pide la base de datos). Sin elegir, o «Otro motivo» sin texto: null (y no se puede confirmar).
  function motivoDe(clave: string): string | null {
    const elegido = motivoElegido[clave];
    if (!elegido) return null;
    if (elegido !== OTRO_MOTIVO) return elegido;
    const t = (motivoOtro[clave] ?? "").replace(/\s+/g, " ").trim().slice(0, MOTIVO_MAX);
    return t.length >= 2 ? t : null;
  }

  async function cancelarPedido(p: Pedido) {
    if (p.estado === "cancelado") return;
    if (confirmando !== `cancelar:${p.id}`) {
      setConfirmando(`cancelar:${p.id}`);
      setAccionMsg(null);
      return;
    }
    // Con la migración, el motivo es obligatorio (el botón ya sale apagado sin él).
    const motivo = cancelacionOk ? motivoDe(p.id) : null;
    if (cancelacionOk && !motivo) return;
    setConfirmando(null);
    const ok = await cambiarEstado(p, "cancelado", cancelacionOk ? { cancelacion_motivo: motivo } : undefined);
    if (!ok) {
      setAccionMsg({ id: p.id, tipo: "error", texto: "No se pudo cancelar el pedido. Vuelve a intentarlo." });
      return;
    }
    const quedanVendidos = articulosParaReponer({ ...p, estado: "cancelado" }).length > 0;
    setAccionMsg({
      id: p.id,
      tipo: "ok",
      texto: `${p.pago_estado === "pagado" && !p.devuelto_en ? "Pedido cancelado. Está pagado online: devuelve el pago con el botón de abajo." : "Pedido cancelado."}${
        quedanVendidos ? " Sus artículos siguen fuera de la venta: si quieres venderlos otra vez, toca «Volver a poner a la venta»." : ""
      }`,
    });
  }

  // «Añadir motivo» / «Cambiar motivo» en un pedido YA cancelado: abre el editor con el motivo actual marcado (si es uno de
  // los fijos) o en «Otro motivo» con su texto.
  function abrirEditorMotivo(p: Pedido) {
    const actual = (p.cancelacion_motivo ?? "").trim();
    const fijo = (MOTIVOS_CANCELACION as readonly string[]).includes(actual);
    setMotivoElegido((x) => ({ ...x, [`editar:${p.id}`]: actual ? (fijo ? actual : OTRO_MOTIVO) : "" }));
    setMotivoOtro((x) => ({ ...x, [`editar:${p.id}`]: actual && !fijo ? actual : "" }));
    setEditandoMotivo(p.id);
    setMotivoMsg(null);
  }

  // Guarda SOLO pedidos.cancelacion_motivo (el mismo update de pedidos que al cancelar, con la regla
  // pedidos_admin_update): el estado, el pago y cancelado_en no se tocan (el disparador de cancelado_en solo salta al
  // cambiar el estado).
  async function guardarMotivo(p: Pedido) {
    const motivo = motivoDe(`editar:${p.id}`);
    if (!motivo || p.estado !== "cancelado") return;
    setGuardando(p.id);
    const { error } = await supabase.from("pedidos").update({ cancelacion_motivo: motivo }).eq("id", p.id);
    setGuardando(null);
    if (error) {
      setMotivoMsg({ id: p.id, tipo: "error", texto: "No se pudo guardar el motivo. Vuelve a intentarlo." });
      return;
    }
    setPedidos((prev) => prev.map((x) => (x.id === p.id ? { ...x, cancelacion_motivo: motivo } : x)));
    setEditandoMotivo(null);
    setMotivoMsg({ id: p.id, tipo: "ok", texto: "Motivo guardado: el cliente ya lo ve en Mis pedidos." });
  }

  // Cancelado un pedido pagado, sus artículos NO vuelven solos a la venta (dueño, 2026-11-15): los vendidos POR ESTE
  // pedido (vendido_pedido_id; sin la migración, cualquier artículo suyo vendido y oculto) se ofrecen para reponerlos.
  function articulosParaReponer(p: Pedido): string[] {
    if (p.estado !== "cancelado") return [];
    return [
      ...new Set(
        (p.pedido_items ?? [])
          .map((it) => (it.product_id ? articulos[it.product_id] : undefined))
          .filter((a): a is ArticuloEstado => !!a && !!a.vendido_en && !a.is_active && ("vendido_pedido_id" in a ? a.vendido_pedido_id === p.id : true))
          .map((a) => a.id)
      ),
    ];
  }

  async function reponerALaVenta(p: Pedido) {
    const ids = articulosParaReponer(p);
    if (!ids.length) return;
    if (confirmando !== `reponer:${p.id}`) {
      setConfirmando(`reponer:${p.id}`);
      setAccionMsg(null);
      return;
    }
    setConfirmando(null);
    setGuardando(p.id);
    const conPedido = ids.some((id) => "vendido_pedido_id" in (articulos[id] ?? {}));
    const { error } = await supabase
      .from("products")
      .update({ is_active: true, vendido_en: null, ...(conPedido ? { vendido_pedido_id: null } : {}) })
      .in("id", ids);
    if (error) {
      setAccionMsg({ id: p.id, tipo: "error", texto: "No se pudo volver a poner a la venta. Vuelve a intentarlo." });
    } else {
      setArticulos((prev) => {
        const copia = { ...prev };
        for (const id of ids) copia[id] = { ...copia[id], is_active: true, vendido_en: null, ...(conPedido ? { vendido_pedido_id: null } : {}) };
        return copia;
      });
      setAccionMsg({ id: p.id, tipo: "ok", texto: ids.length === 1 ? "Artículo otra vez a la venta en la tienda." : `${ids.length} artículos otra vez a la venta en la tienda.` });
    }
    setGuardando(null);
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

  function irAFicha(p: Pedido) {
    if (!p.user_id) return;
    router.push({ pathname: "/admin/cliente/[userId]", params: { userId: p.user_id, email: p.email ?? "" } } as never);
  }

  // Pastillas principales (con su recuento) y las de «Más filtros».
  const pastillas: { value: Filtro; label: string }[] = [
    { value: "todos", label: `Todos (${cuentas.todos})` },
    { value: "por_pagar", label: `Por pagar (${cuentas.porPagar})` },
    { value: "pagados", label: `Pagados (${cuentas.pagados})` },
    { value: "por_preparar", label: `Por preparar (${cuentas.porPreparar})` },
    ...(franjaOk ? [{ value: "reparto_hoy" as const, label: `Reparto de hoy (${repartoDeHoy.length})` }] : []),
    { value: "enviados", label: `Enviados (${cuentas.enviados})` },
    { value: "cancelados", label: `Cancelados (${cuentas.cancelados})` },
    // Solo con la migración y si queda alguno por completar (o si es el filtro elegido).
    ...(cancelacionOk && (cuentas.sinMotivo > 0 || filtro === "cancelados_sin_motivo")
      ? [{ value: "cancelados_sin_motivo" as const, label: `Cancelados sin motivo (${cuentas.sinMotivo})` }]
      : []),
    ...(dobleOk ? [{ value: "doble_venta" as const, label: `Doble venta (${cuentas.doble})` }] : []),
  ];
  const otrosFiltros: { value: Filtro; label: string }[] = [
    { value: "activos", label: "En curso" },
    { value: "hoy", label: `Hoy (${cuentas.hoy})` },
    { value: "pendiente", label: "Pendiente" },
    { value: "confirmado", label: "Confirmado" },
    { value: "preparado", label: "Preparado" },
    { value: "entregado", label: "Entregado" },
    ...(devolucionOk ? [{ value: "devueltos" as const, label: `Devueltos (${cuentas.devueltos})` }] : []),
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
  const filtroExtra = otrosFiltros.some((f) => f.value === filtro);
  const nombreFiltroExtra = otrosFiltros.find((f) => f.value === filtro)?.label.replace(/ \(\d+\)$/, "");

  // Cifras de arriba: tocarlas filtra la lista.
  const cifras: { key: Filtro | "ingresos"; valor: string; etiqueta: string; icono: IoniconName; alerta?: boolean }[] = [
    { key: "hoy", valor: String(cuentas.hoy), etiqueta: "Hoy", icono: "today-outline" },
    { key: "por_pagar", valor: String(cuentas.porPagar), etiqueta: "Por pagar", icono: "wallet-outline" },
    { key: "por_preparar", valor: String(cuentas.porPreparar), etiqueta: "Por preparar", icono: "cube-outline" },
    ...(franjaOk ? [{ key: "reparto_hoy" as const, valor: String(repartoDeHoy.length), etiqueta: "Reparto de hoy", icono: "bicycle-outline" as IoniconName }] : []),
    ...(dobleOk ? [{ key: "doble_venta" as const, valor: String(cuentas.doble), etiqueta: "Doble venta", icono: "alert-circle-outline" as IoniconName, alerta: cuentas.dobleSinDevolver > 0 }] : []),
    ...(devolucionOk ? [{ key: "devueltos" as const, valor: String(cuentas.devueltos), etiqueta: "Devueltos", icono: "return-down-back-outline" as IoniconName }] : []),
    { key: "ingresos", valor: fmtEUR(cuentas.ingresos30), etiqueta: "Ingresos 30 días", icono: "trending-up-outline" },
  ];
  const anchoCifra: Ancho = isMobile ? "30%" : 0;
  const anchoBloque: Ancho = isMobile ? "100%" : "45%";

  // Los motivos en pastillas (44 px) y, con «Otro motivo», su campo de 16 px con la ayuda «Lo verá el cliente…». Lo usan
  // la cancelación (clave = id del pedido) y «Añadir / Cambiar motivo» (clave = `editar:<id>`).
  function selectorMotivo(p: Pedido, clave: string, idBase: string, idOtro: string) {
    const elegido = motivoElegido[clave] ?? "";
    return (
      <>
        <View role="radiogroup" aria-label={`Motivo de la cancelación del pedido ${p.numero}`} style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
          {[...MOTIVOS_CANCELACION, OTRO_MOTIVO].map((m, i) => {
            const activo = elegido === m;
            return (
              <Pressable
                key={m}
                nativeID={`${idBase}-${i}`}
                onPress={() => setMotivoElegido((x) => ({ ...x, [clave]: m }))}
                accessibilityRole="radio"
                accessibilityState={{ checked: activo }}
                aria-checked={activo}
                style={({ pressed }) => ({
                  minHeight: TACTIL.minimo,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: activo ? COLORS.accent : COLORS.border,
                  backgroundColor: activo ? COLORS.accent2 : COLORS.bg,
                  opacity: pressed ? 0.85 : 1,
                  maxWidth: "100%",
                })}
              >
                <Ionicons name={activo ? "radio-button-on" : "radio-button-off"} size={16} color={activo ? COLORS.accent : COLORS.muted} />
                <Text style={{ color: COLORS.text, fontWeight: activo ? "900" : "800", fontSize: TAMANOS.minimo, flexShrink: 1 }}>{m === OTRO_MOTIVO ? "Otro motivo" : m}</Text>
              </Pressable>
            );
          })}
        </View>
        {elegido === OTRO_MOTIVO ? (
          <View style={{ gap: 4 }}>
            <TextInput
              nativeID={idOtro}
              value={motivoOtro[clave] ?? ""}
              onChangeText={(t) => setMotivoOtro((x) => ({ ...x, [clave]: t.slice(0, MOTIVO_MAX) }))}
              maxLength={MOTIVO_MAX}
              placeholder="Escribe el motivo"
              placeholderTextColor={COLORS.muted}
              accessibilityLabel={`Otro motivo de cancelación del pedido ${p.numero}`}
              style={{ ...estiloCampo, width: "100%" }}
            />
            <Detalle nativeID={`${idOtro}-ayuda`}>Lo verá el cliente: escríbelo de forma clara y profesional.</Detalle>
          </View>
        ) : null}
        {/* Cómo lo leerá el cliente en Mis pedidos (los fijos, en su versión para el cliente). */}
        {motivoDe(clave) && elegido !== OTRO_MOTIVO ? (
          <Detalle nativeID={`${idBase}-cliente`}>El cliente leerá: «{motivoParaCliente(motivoDe(clave))}»</Detalle>
        ) : null}
      </>
    );
  }

  // ---------- Detalle de un pedido (bloques y acciones) ----------
  function detalle(p: Pedido) {
    const tienda = enTienda(p);
    const pasos = tienda ? [] : pasosDelPedido(p, historial?.[p.id]).filter((x) => x.hecho);
    const tipoEntrega = tienda ? "Compra en tienda" : p.entrega === "recogida" ? "Entrega en mano" : "Envío a domicilio";
    const direccion = p.entrega === "envio" && (p.direccion || p.ciudad) ? [p.direccion, [p.codigo_postal, p.ciudad].filter(Boolean).join(" ")].filter(Boolean).join(", ") : null;
    const puedeDevolver = devolucionOk && p.pago_estado === "pagado" && !p.devuelto_en;
    const puedeCancelar = p.estado !== "cancelado" && p.estado !== "entregado";
    // También tras tocar la pastilla de estado «Cancelado» (p. ej. en un entregado): pide el motivo igual.
    const confirmandoCancelar = confirmando === `cancelar:${p.id}` && p.estado !== "cancelado";
    const cancelable = puedeCancelar || confirmandoCancelar;
    const reponer = articulosParaReponer(p);
    return (
      <View nativeID={`pedido-detalle-${p.numero}`} style={{ gap: 12, paddingBottom: 16 }}>
        {/* Doble venta: se cobró un artículo único que ya estaba vendido (lo marca api/pago.ts al apuntar el pago). */}
        {dobleOk && p.doble_venta_en ? (
          <View nativeID={`pedido-doble-venta-${p.numero}`} accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: COLORS.dangerBg }}>
            <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
            <Text style={{ color: COLORS.danger, fontWeight: "900", fontSize: TAMANOS.cuerpo, flexShrink: 1 }}>
              Artículo ya vendido: devuelve el pago{p.devuelto_en ? " (ya devuelto)" : ""}
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {/* Artículos: cada uno con su precio, el envío (con su zona) y el total. */}
          <Bloque nativeID={`pedido-bloque-articulos-${p.numero}`} icono="cube-outline" titulo="Artículos" ancho={anchoBloque}>
            {(p.pedido_items ?? []).map((it) => (
              <View key={it.id} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                <Text style={{ flex: 1, minWidth: 0, color: COLORS.text, fontSize: TAMANOS.minimo, fontWeight: "700", lineHeight: 19 }}>{it.titulo}</Text>
                <Text style={{ color: COLORS.accentDark, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>{fmtEUR(it.precio_eur)}</Text>
              </View>
            ))}
            {!(p.pedido_items ?? []).length ? <Detalle>Sin artículos apuntados.</Detalle> : null}
            {envioOk && !tienda ? (
              <Text nativeID={`pedido-envio-${p.numero}`} style={{ color: COLORS.text, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                Artículos {fmtEUR(Number(p.productos_eur ?? p.total_eur))} · Envío {Number(p.envio_eur ?? 0) === 0 ? "gratis" : fmtEUR(Number(p.envio_eur))}
                {nombreZona(p.zona_envio) ? ` (${nombreZona(p.zona_envio)})` : ""}
                {p.peso_kg ? ` · ${fmtKg(p.peso_kg)}` : ""} · {p.envio_manual ? "a mano" : "automático"}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: COLORS.border }}>
              <Text style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>Total</Text>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>{fmtEUR(p.total_eur)}</Text>
            </View>
          </Bloque>

          {/* Pago: online (Stripe), en tienda o sin pagar; devolución y factura. */}
          <Bloque nativeID={`pedido-bloque-pago-${p.numero}`} icono="card-outline" titulo="Pago" ancho={anchoBloque}>
            {tienda ? (
              // Venta en mano de VeoAura: cómo se pagó y si ya está en la cuenta del cliente (o a quién espera).
              <View nativeID={`pedido-tienda-${p.numero}`} style={{ gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                  <Ionicons name="storefront-outline" size={16} color={COLORS.success} style={{ marginTop: 1 }} />
                  <Text style={{ color: COLORS.success, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19, flex: 1, minWidth: 0 }}>
                    En tienda · pagado{FORMA_PAGO_TIENDA[p.venta_forma_pago ?? ""] ? ` ${FORMA_PAGO_TIENDA[p.venta_forma_pago ?? ""]}` : ""} · entregado
                  </Text>
                </View>
                <Text nativeID={`pedido-tienda-cuenta-${p.numero}`} selectable style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                  {p.user_id ? "Unida a la cuenta del cliente" : `Pendiente de que se registre ${p.email}`}
                </Text>
              </View>
            ) : null}
            {/* Pago con tarjeta: lo apunta el servidor tras preguntárselo a Stripe. */}
            {pagoOk && p.pago_estado ? (
              <View nativeID={`pedido-pago-${p.numero}`} style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                  <Ionicons name={p.pago_estado === "pagado" ? "card" : "card-outline"} size={16} color={p.pago_estado === "pagado" ? COLORS.success : COLORS.muted} style={{ marginTop: 1 }} />
                  <Text style={{ color: p.pago_estado === "pagado" ? COLORS.success : COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19, flex: 1, minWidth: 0 }}>
                    {p.pago_estado === "pagado"
                      ? `Pagado online${p.pago_metodo && METODO_PAGO[p.pago_metodo] ? ` con ${METODO_PAGO[p.pago_metodo]}` : ""} · ${fmtEUR(Number(p.pagado_eur ?? 0))}${p.pagado_en ? ` · ${fmtFecha(p.pagado_en)}` : ""}${p.pago_modo === "prueba" ? " · de prueba (sin cobro real)" : ""}`
                      : "Pago online empezado, sin terminar"}
                  </Text>
                </View>
                {p.devuelto_en ? (
                  <View nativeID={`pedido-devuelto-${p.numero}`} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                    <Ionicons name="return-down-back-outline" size={16} color={COLORS.muted} style={{ marginTop: 1 }} />
                    <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19, flex: 1, minWidth: 0 }}>
                      Devuelto · {fmtEUR(Number(p.devuelto_eur ?? 0))} · {fmtFecha(p.devuelto_en)}
                    </Text>
                  </View>
                ) : p.pago_estado === "pagado" && p.estado === "cancelado" ? (
                  <Text style={{ color: COLORS.danger, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                    Cancelado y pagado: devuelve el pago{devolucionOk ? " con el botón de abajo" : " desde Stripe"}.
                  </Text>
                ) : p.pago_estado === "pagado" && Math.round(Number(p.pagado_eur ?? 0) * 100) !== Math.round(Number(p.total_eur) * 100) ? (
                  <Text style={{ color: COLORS.gold, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                    El total ahora es {fmtEUR(p.total_eur)}: la diferencia se arregla desde Stripe o por el chat.
                  </Text>
                ) : null}
                {enlaceStripe(p) ? (
                  <AccionTexto nativeID={`pedido-pago-stripe-${p.numero}`} rol="link" icono="open-outline" texto="Ver el pago en Stripe" onPress={() => openExternalLink(enlaceStripe(p) as string)} />
                ) : null}
              </View>
            ) : null}
            {!tienda && !(pagoOk && p.pago_estado) ? (
              <Detalle>{p.estado === "entregado" ? "Sin pago online: se cobró en la entrega." : "Sin pago online todavía (se acuerda por el chat o se paga en la entrega)."}</Detalle>
            ) : null}
            {/* Factura de VeoAura: número y «Descargar», «PDF pendiente» o «Sin factura». */}
            {facturasOk ? (
              <View nativeID={`pedido-factura-${p.numero}`} style={{ gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Ionicons name="document-text-outline" size={16} color={facturas[p.id] ? COLORS.text : COLORS.muted} />
                  <Text style={{ color: facturas[p.id] ? COLORS.text : COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                    {facturas[p.id] ? `Factura ${facturas[p.id].numero_factura ?? ""}${facturas[p.id].pdf ? "" : " · PDF pendiente"}` : "Sin factura"}
                  </Text>
                  {facturas[p.id]?.pdf ? (
                    <AccionTexto
                      nativeID={`pedido-factura-descargar-${p.numero}`}
                      icono="download-outline"
                      texto="Descargar"
                      etiqueta={`Descargar la factura del pedido ${p.numero}`}
                      onPress={() => descargarFactura(p)}
                    />
                  ) : null}
                </View>
                {facturaMsg?.id === p.id ? <Detalle color={COLORS.danger}>{facturaMsg.texto}</Detalle> : null}
              </View>
            ) : null}
          </Bloque>

          {/* Entrega: tipo, día y franja, dirección, notas y seguimiento de Correos. */}
          <Bloque nativeID={`pedido-bloque-entrega-${p.numero}`} icono="location-outline" titulo="Entrega" ancho={anchoBloque}>
            <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
              {tipoEntrega} · pedido el {fmtFecha(p.created_at)}
            </Text>
            {franjaOk && p.entrega_franja && p.entrega_fecha ? (
              <Detalle color={COLORS.text}>
                Franja: {p.entrega_fecha === hoy ? "hoy" : fechaCortaEntrega(p.entrega_fecha)} · {nombreFranja(p.entrega_franja)}
              </Detalle>
            ) : null}
            {direccion ? (
              <Text selectable style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                {direccion}
              </Text>
            ) : null}
            {p.notas ? <Text style={{ color: COLORS.muted, fontStyle: "italic", fontSize: TAMANOS.minimo, lineHeight: 19 }}>“{p.notas}”</Text> : null}
            {historial && p.entrega === "envio" && !tienda ? (
              <Detalle color={numerosEnvio[p.id] ? COLORS.text : COLORS.muted}>
                {numerosEnvio[p.id] ? `Seguimiento de Correos: ${numerosEnvio[p.id]}` : "Sin número de Correos todavía (se pone abajo)."}
              </Detalle>
            ) : null}
          </Bloque>

          {/* Cliente: nombre, contacto, referencia y su ficha. */}
          <Bloque nativeID={`pedido-bloque-cliente-${p.numero}`} icono="person-outline" titulo="Cliente" ancho={anchoBloque}>
            <Text selectable style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
              {p.nombre}
            </Text>
            <Text selectable style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
              {/* Una venta en mano no guarda teléfono (solo el correo con el que se une a la cuenta). */}
              {tienda ? p.email : `${p.telefono} · ${p.email}`}
            </Text>
            {p.codigo_seguimiento ? (
              <Text nativeID={`pedido-interno-${p.numero}`} style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, fontWeight: "700" }}>
                Nº interno {p.numero}
              </Text>
            ) : null}
            {!tienda && p.codigo_seguimiento ? (
              <EtiquetaNumero
                codigo={p.codigo_seguimiento}
                veoaura={!!p.id_veoaura}
                enCuenta={!!p.user_id}
                vinculadoEn={p.vinculado_en ?? null}
                desdeChat={p.nota_admin === NOTA_ASIGNADO_CHAT}
              />
            ) : null}
            {p.user_id ? <AccionTexto nativeID={`pedido-ficha-${p.numero}`} icono="id-card-outline" texto="Ver ficha del cliente" onPress={() => irAFicha(p)} /> : null}
          </Bloque>

          {/* Los pasos con su fecha y hora (las que guarda la base de datos; sin hora conocida, «sin hora»). */}
          {!tienda ? (
            <Bloque nativeID={`pedido-bloque-pasos-${p.numero}`} icono="git-commit-outline" titulo="Pasos" ancho={anchoBloque}>
              <View nativeID={`pedido-pasos-${p.numero}`} style={{ gap: 4 }}>
                {pasos.map((x) => (
                  <Text
                    key={x.clave}
                    nativeID={`pedido-paso-${p.numero}-${x.clave}`}
                    style={{ color: x.tipo === "cancelado" ? COLORS.danger : x.actual ? COLORS.accentDark : COLORS.text, fontWeight: x.actual ? "900" : "700", fontSize: TAMANOS.minimo }}
                  >
                    {x.etiqueta}
                    {fechaHoraPaso(x.fecha) ? ` · ${fechaHoraPaso(x.fecha)}` : " · sin hora"}
                  </Text>
                ))}
              </View>
            </Bloque>
          ) : null}

          {/* Cancelación (migración 20261116100000): el motivo que ve el cliente y, si lo pidió, su «Avisarme cuando haya
              otro» con el canal (el correo aún no se manda: lo dice). */}
          {cancelacionOk && p.estado === "cancelado" && !tienda ? (
            <Bloque nativeID={`pedido-bloque-cancelacion-${p.numero}`} icono="close-circle-outline" titulo="Cancelación" ancho={anchoBloque}>
              <Text
                nativeID={`pedido-cancelacion-motivo-${p.numero}`}
                style={{ color: p.cancelacion_motivo ? COLORS.text : "#92400E", fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}
              >
                {p.cancelacion_motivo ? `Motivo: ${p.cancelacion_motivo}` : "Sin motivo: el cliente no ve por qué se canceló."}
              </Text>
              {p.cancelado_en ? <Detalle>Cancelado el {fmtFecha(p.cancelado_en)}</Detalle> : null}
              {/* Añadir o cambiar el motivo de un pedido ya cancelado: solo cancelacion_motivo (ni estado, ni pago, ni hora). */}
              {editandoMotivo === p.id ? (
                <View nativeID={`pedido-editar-motivos-${p.numero}`} style={{ gap: 8, borderRadius: 14, backgroundColor: COLORS.bg2, padding: 12 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>Motivo de la cancelación (lo verá el cliente)</Text>
                  {selectorMotivo(p, `editar:${p.id}`, `pedido-editar-motivo-${p.numero}`, `pedido-editar-motivo-otro-${p.numero}`)}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 18, rowGap: TACTIL.separacion }}>
                    <AccionTexto
                      nativeID={`pedido-motivo-guardar-${p.numero}`}
                      icono="checkmark-circle-outline"
                      texto="Guardar motivo"
                      disabled={guardando === p.id || !motivoDe(`editar:${p.id}`) || motivoDe(`editar:${p.id}`) === (p.cancelacion_motivo ?? "").trim()}
                      onPress={() => guardarMotivo(p)}
                    />
                    <AccionTexto
                      nativeID={`pedido-motivo-descartar-${p.numero}`}
                      icono="close-outline"
                      color={COLORS.muted}
                      texto="Descartar"
                      onPress={() => setEditandoMotivo(null)}
                    />
                  </View>
                </View>
              ) : (
                <AccionTexto
                  nativeID={`pedido-motivo-editar-${p.numero}`}
                  icono={p.cancelacion_motivo ? "create-outline" : "add-circle-outline"}
                  texto={p.cancelacion_motivo ? "Cambiar motivo" : "Añadir motivo"}
                  onPress={() => abrirEditorMotivo(p)}
                />
              )}
              {motivoMsg?.id === p.id ? (
                <Text nativeID={`pedido-motivo-mensaje-${p.numero}`} style={{ color: motivoMsg.tipo === "ok" ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                  {motivoMsg.texto}
                </Text>
              ) : null}
              {avisosRepo ? (
                (() => {
                  const a = avisosRepo.find((x) => x.pedido_id === p.id);
                  if (!a) {
                    return p.cancelacion_motivo === MOTIVO_NO_DISPONIBLE ? (
                      <Detalle nativeID={`pedido-aviso-repo-${p.numero}`}>El cliente no ha pedido aviso de reposición.</Detalle>
                    ) : null;
                  }
                  return (
                    <View nativeID={`pedido-aviso-repo-${p.numero}`} style={{ gap: 2 }}>
                      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                        <Ionicons name={a.activo ? "notifications" : "notifications-off-outline"} size={16} color={a.activo ? COLORS.success : COLORS.muted} style={{ marginTop: 1 }} />
                        <Text style={{ color: a.activo ? COLORS.success : COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19, flex: 1, minWidth: 0 }}>
                          {a.activo ? `Pidió aviso cuando haya otro «${a.texto}» · ${CANAL_ADMIN[a.canal]}` : `Aviso de «${a.texto}» apagado por el cliente`}
                        </Text>
                      </View>
                      {a.avisado_en ? <Detalle color={COLORS.text}>Ya se le avisó el {fmtFecha(a.avisado_en)}</Detalle> : null}
                      {a.activo && a.canal !== "app" ? (
                        <Detalle nativeID={`pedido-aviso-repo-correo-${p.numero}`} color="#92400E">
                          Correo pendiente de activar en la tienda (de momento Blue le avisa en la app).
                        </Detalle>
                      ) : null}
                    </View>
                  );
                })()
              ) : null}
            </Bloque>
          ) : null}

          {/* Valoración tras la entrega (mejora 11): la nota y el comentario del cliente, o cuándo se le pide. */}
          {valoraciones && p.estado === "entregado" ? (
            <Bloque nativeID={`pedido-bloque-valoracion-${p.numero}`} icono="star-outline" titulo="Valoración" ancho={anchoBloque}>
              <ValoracionPedidoAdmin nativeID={`pedido-valoracion-${p.numero}`} valoracion={valoraciones[p.id]} entregadoEn={entregadoEnDe(historial?.[p.id])} izquierda />
            </Bloque>
          ) : null}
        </View>

        {/* Acciones (abajo): estado, escribir al cliente, devolver, cancelar, reponer, envío a mano y nº de Correos. Una venta
            en mano ya está pagada y entregada (la gestiona VeoAura): sin cambiar estado ni WhatsApp. */}
        <View nativeID={`pedido-acciones-${p.numero}`} style={{ gap: 10, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="options-outline" size={18} color={COLORS.accent} />
            <Text style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>Acciones</Text>
          </View>
          {!tienda ? (
            <View style={{ gap: 6 }}>
              <Detalle>Estado del pedido</Detalle>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
                {ESTADOS.map((e) => {
                  const activo = p.estado === e.value;
                  return (
                    <Pressable
                      key={e.value}
                      nativeID={`pedido-estado-${p.numero}-${e.value}`}
                      disabled={guardando === p.id}
                      // «Cancelado» pasa por el mismo paso que «Cancelar pedido» (con la migración, el motivo es obligatorio).
                      onPress={() => (e.value === "cancelado" && cancelacionOk && !tienda ? cancelarPedido(p) : cambiarEstado(p, e.value))}
                      accessibilityRole="button"
                      accessibilityState={{ selected: activo }}
                      style={{
                        minHeight: TACTIL.minimo,
                        justifyContent: "center",
                        paddingVertical: 6,
                        paddingHorizontal: 12,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: activo ? (e.value === "cancelado" ? COLORS.danger : COLORS.accent) : COLORS.border,
                        backgroundColor: activo ? (e.value === "cancelado" ? COLORS.dangerBg : COLORS.accent2) : COLORS.bg,
                        opacity: guardando === p.id ? 0.5 : 1,
                      }}
                    >
                      <Text style={{ color: activo ? (e.value === "cancelado" ? COLORS.danger : COLORS.accentDark) : COLORS.muted, fontWeight: activo ? "900" : "800", fontSize: TAMANOS.minimo }}>
                        {e.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <Detalle>Venta en tienda: ya está pagada y entregada (la gestiona VeoAura).</Detalle>
          )}

          {/* Escribir al cliente, devolver el pago, cancelar (texto con su icono; el primer toque pide confirmar) y reponer. */}
          {!tienda || reponer.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 18, rowGap: TACTIL.separacion }}>
              {!tienda ? (
                <Pressable
                  nativeID={`pedido-whatsapp-${p.numero}`}
                  onPress={() => whatsapp(p)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.88 : 1,
                    minHeight: TACTIL.minimo,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.bg,
                  })}
                >
                  <Ionicons name="logo-whatsapp" size={16} color={COLORS.success} />
                  <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.cuerpo }}>Escribir al cliente</Text>
                </Pressable>
              ) : null}
              {!tienda && puedeDevolver ? (
                <AccionTexto
                  nativeID={`pedido-devolver-${p.numero}`}
                  icono="return-down-back-outline"
                  color={COLORS.danger}
                  disabled={guardando === p.id}
                  onPress={() => devolverPago(p)}
                  texto={confirmando === `devolver:${p.id}` ? `Toca otra vez para devolver ${fmtEUR(Number(p.pagado_eur ?? 0))}` : "Devolver el pago"}
                />
              ) : null}
              {!tienda && cancelable ? (
                <AccionTexto
                  nativeID={`pedido-cancelar-${p.numero}`}
                  icono="close-circle-outline"
                  color={COLORS.danger}
                  // Con la migración, sin motivo elegido no se puede confirmar.
                  disabled={guardando === p.id || (confirmandoCancelar && cancelacionOk && !motivoDe(p.id))}
                  onPress={() => cancelarPedido(p)}
                  texto={
                    !confirmandoCancelar
                      ? "Cancelar pedido"
                      : cancelacionOk && !motivoDe(p.id)
                        ? "Elige el motivo para cancelar"
                        : "Toca otra vez para cancelar el pedido"
                  }
                />
              ) : null}
              {/* Cancelado: sus artículos siguen fuera de la venta hasta que el dueño decida reponerlos (segundo toque). */}
              {reponer.length > 0 ? (
                <AccionTexto
                  nativeID={`pedido-reponer-${p.numero}`}
                  icono="storefront-outline"
                  disabled={guardando === p.id}
                  onPress={() => reponerALaVenta(p)}
                  texto={confirmando === `reponer:${p.id}` ? "Toca otra vez para ponerlo a la venta" : "Volver a poner a la venta"}
                />
              ) : null}
            </View>
          ) : null}
          {/* Tras el primer toque de «Cancelar pedido»: el motivo que verá el cliente en Mis pedidos (obligatorio; el
              primero le ofrece «Avisarme cuando haya otro»). */}
          {cancelacionOk && !tienda && cancelable && confirmando === `cancelar:${p.id}` ? (
            <View nativeID={`pedido-cancelar-motivos-${p.numero}`} style={{ gap: 8, borderRadius: 14, backgroundColor: COLORS.bg2, padding: 12 }}>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>Motivo de la cancelación (obligatorio, lo verá el cliente)</Text>
              {selectorMotivo(p, p.id, `pedido-motivo-${p.numero}`, `pedido-motivo-otro-${p.numero}`)}
              <Detalle nativeID={`pedido-cancelar-ayuda-${p.numero}`}>
                {!motivoDe(p.id)
                  ? motivoElegido[p.id] === OTRO_MOTIVO
                    ? "Escribe el motivo para poder cancelar."
                    : "Elige un motivo para poder cancelar."
                  : motivoElegido[p.id] === MOTIVO_NO_DISPONIBLE
                    ? "El cliente podrá pedir que le avisemos cuando haya otro parecido. Toca otra vez «Cancelar» para confirmar."
                    : "Toca otra vez «Cancelar» para confirmar."}
              </Detalle>
            </View>
          ) : null}
          {accionMsg?.id === p.id ? (
            <Text nativeID={`pedido-accion-mensaje-${p.numero}`} style={{ color: accionMsg.tipo === "ok" ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
              {accionMsg.texto}
            </Text>
          ) : null}

          {/* Envío del pedido: automático (con la tarifa) o a mano para este pedido. (Una venta en mano no tiene envío.) */}
          {envioOk && !tienda ? (
            <View style={{ gap: 6 }}>
              <Detalle>Envío a mano para este pedido ({p.envio_manual ? "ahora a mano" : "ahora automático, con la tarifa"})</Detalle>
              <View style={{ flexDirection: "row", alignItems: "center", gap: TACTIL.separacion, flexWrap: "wrap" }}>
                <TextInput
                  nativeID={`pedido-envio-campo-${p.numero}`}
                  value={envioEscrito[p.id] ?? ""}
                  onChangeText={(t) => setEnvioEscrito((e) => ({ ...e, [p.id]: t }))}
                  placeholder="Envío a mano (€)"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="decimal-pad"
                  accessibilityLabel={`Envío a mano del pedido ${p.numero}`}
                  style={{ ...estiloCampo, width: 160 }}
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
                  <AccionTexto nativeID={`pedido-envio-automatico-${p.numero}`} icono="refresh-outline" texto="Volver al automático" disabled={guardando === p.id} onPress={() => guardarEnvio(p, true)} />
                ) : null}
              </View>
              {envioMsg?.id === p.id ? (
                <Text nativeID={`pedido-envio-mensaje-${p.numero}`} style={{ color: envioMsg.tipo === "ok" ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                  {envioMsg.texto}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Número de envío (solo con la migración y si va a domicilio): el cliente ve «Seguir el envío». */}
          {historial && p.entrega === "envio" && !tienda ? (
            <View nativeID={`pedido-numero-envio-${p.numero}`} style={{ gap: 6 }}>
              <Detalle>Nº de Correos o enlace del envío (el cliente ve «Seguir el envío»)</Detalle>
              <View style={{ flexDirection: "row", alignItems: "center", gap: TACTIL.separacion, flexWrap: "wrap" }}>
                <TextInput
                  nativeID={`pedido-numero-envio-campo-${p.numero}`}
                  value={numeroEscrito[p.id] ?? numerosEnvio[p.id] ?? ""}
                  onChangeText={(t) => setNumeroEscrito((e) => ({ ...e, [p.id]: t.slice(0, 300) }))}
                  placeholder="Nº de Correos o enlace"
                  placeholderTextColor={COLORS.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  accessibilityLabel={`Número de envío del pedido ${p.numero}`}
                  style={{ ...estiloCampo, flexGrow: 1, flexShrink: 1, minWidth: 0, maxWidth: 320 }}
                />
                <Pressable
                  nativeID={`pedido-numero-envio-guardar-${p.numero}`}
                  disabled={guardando === p.id}
                  onPress={() => guardarNumeroEnvio(p)}
                  accessibilityRole="button"
                  accessibilityLabel={`Guardar el número de envío del pedido ${p.numero}`}
                  style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: pressed || guardando === p.id ? 0.6 : 1 })}
                >
                  <Ionicons name="checkmark-circle" size={28} color={COLORS.accent} />
                </Pressable>
              </View>
              {numerosEnvio[p.id] && enlaceSeguimientoEnvio(numerosEnvio[p.id]) ? (
                <AccionTexto
                  nativeID={`pedido-numero-envio-ver-${p.numero}`}
                  rol="link"
                  icono="navigate-outline"
                  texto="Ver el envío (lo que ve el cliente)"
                  onPress={() => openExternalLink(enlaceSeguimientoEnvio(numerosEnvio[p.id]) as string)}
                />
              ) : null}
              {numeroMsg?.id === p.id ? (
                <Text nativeID={`pedido-numero-envio-mensaje-${p.numero}`} style={{ color: numeroMsg.tipo === "ok" ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                  {numeroMsg.texto}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  // ---------- Fila compacta ----------
  function fila(p: Pedido, i: number) {
    const abierto = estaAbierto(p.id);
    const gris = apagado(p);
    const pago = comoPago(p);
    const tienda = enTienda(p);
    const titulo = p.codigo_seguimiento ? p.codigo_seguimiento : `Pedido nº ${p.numero}`;
    return (
      <View key={p.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border }}>
        <Pressable
          nativeID={`pedido-fila-${p.numero}`}
          onPress={() => alternar(p.id)}
          accessibilityRole="button"
          accessibilityState={{ expanded: abierto }}
          aria-expanded={abierto}
          accessibilityLabel={`${titulo}, ${p.nombre}, ${fmtEUR(p.total_eur)}, ${etiquetaEstado(p).texto}. ${abierto ? "Plegar" : "Ver el detalle"}`}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, opacity: pressed ? 0.85 : 1 })}
        >
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 8, rowGap: 4 }}>
              <Text nativeID={`pedido-titulo-${p.numero}`} style={{ color: gris ? COLORS.muted : COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo, lineHeight: 21, letterSpacing: 0.3 }}>
                {titulo}
              </Text>
              <EtiquetaEstado p={p} />
            </View>
            <Text numberOfLines={1} style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18 }}>
              {p.nombre} · {fmtFecha(p.created_at)}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 14, rowGap: 4, marginTop: 1 }}>
              <Etiqueta icon={pago.icono} texto={pago.texto} color={gris ? COLORS.muted : pago.color} />
              {franjaOk && p.entrega_franja && p.entrega_fecha ? (
                <Etiqueta
                  nativeID={`pedido-franja-${p.numero}`}
                  icon="time-outline"
                  color={gris ? COLORS.muted : COLORS.text}
                  texto={`${p.entrega_fecha === hoy ? "Hoy" : fechaCortaEntrega(p.entrega_fecha)} · ${nombreFranja(p.entrega_franja)}`}
                />
              ) : !tienda ? (
                <Etiqueta icon={p.entrega === "recogida" ? "hand-left-outline" : "cube-outline"} color={gris ? COLORS.muted : COLORS.text} texto={p.entrega === "recogida" ? "Entrega en mano" : "Envío a domicilio"} />
              ) : null}
              {faltaDevolver(p) ? <Etiqueta icon="alert-circle-outline" color={COLORS.danger} texto="Falta devolver el pago" /> : null}
              {/* Cancelado sin motivo: el cliente no ve por qué (se completa con «Añadir motivo» en el detalle). */}
              {cancelacionOk && sinMotivo(p) ? <Etiqueta nativeID={`pedido-sin-motivo-${p.numero}`} icon="help-circle-outline" color="#92400E" texto="Sin motivo" /> : null}
            </View>
          </View>
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            <Text nativeID={`pedido-importe-${p.numero}`} style={{ color: gris ? COLORS.muted : COLORS.text, fontWeight: "900", fontSize: TAMANOS.destacado, lineHeight: 22 }}>
              {fmtEUR(p.total_eur)}
            </Text>
            {p.devuelto_en ? (
              <Text nativeID={`pedido-devuelto-fila-${p.numero}`} style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                Devuelto {fmtEUR(Number(p.devuelto_eur ?? 0))}
              </Text>
            ) : null}
            <Ionicons name={abierto ? "chevron-up" : "chevron-down"} size={18} color={COLORS.muted} style={{ marginTop: 2 }} />
          </View>
        </Pressable>
        {abierto ? detalle(p) : null}
      </View>
    );
  }

  const buscando = !!busqueda.trim();

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
          paddingTop: 8 + insets.top,
          paddingBottom: 8,
        }}
      >
        <View style={{ width: "100%", maxWidth: 960, alignSelf: "center", minHeight: TACTIL.minimo, justifyContent: "center" }}>
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
          <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.destacado, textAlign: "center", paddingHorizontal: 48 }}>
            Pedidos
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: "100%", maxWidth: 960, gap: 16 }}>
          {/* 1) Avisos al móvil del dueño (2026-11-15), plegados en una línea discreta. */}
          <AvisosMovil plegable />

          {/* 2) Buscador (16 px: con menos, Safari del iPhone hace zoom al escribir). Con algo escrito busca en todos. */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              minHeight: CAMPO.alto,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.card,
              paddingLeft: 14,
            }}
          >
            <Ionicons name="search" size={20} color={COLORS.accent} />
            <TextInput
              nativeID="pedidos-buscar"
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder={isMobile ? "VZ-…, nombre, correo o teléfono" : "Buscar por referencia (VZ-…), nombre, correo o teléfono"}
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Buscar pedidos por referencia, nombre, correo o teléfono"
              style={{ flex: 1, minWidth: 0, minHeight: CAMPO.alto, paddingHorizontal: 10, color: COLORS.text, fontSize: CAMPO.letra }}
            />
            {busqueda ? (
              <Pressable
                onPress={() => setBusqueda("")}
                accessibilityRole="button"
                accessibilityLabel="Borrar la búsqueda"
                style={({ pressed }) => ({ width: TACTIL.minimo, height: TACTIL.minimo, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
              >
                <Ionicons name="close-circle" size={20} color={COLORS.muted} />
              </Pressable>
            ) : null}
          </View>

          {/* 3) Cifras clave en tarjetas (número grande, etiqueta debajo); tocarlas filtra la lista. */}
          {!loading && !err ? (
            <View nativeID="pedidos-cifras" style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
              {cifras.map((c) => (
                <Cifra
                  key={c.key}
                  nativeID={`pedidos-cifra-${c.key}`}
                  valor={c.valor}
                  etiqueta={c.etiqueta}
                  icono={c.icono}
                  alerta={c.alerta}
                  ancho={c.key === "ingresos" && isMobile ? "100%" : anchoCifra}
                  activa={!buscando && (c.key === "ingresos" ? filtro === "pagados" : filtro === c.key)}
                  onPress={() => elegirFiltro(c.key === "ingresos" ? "pagados" : c.key)}
                />
              ))}
            </View>
          ) : null}

          {err ? (
            <View style={{ borderRadius: 14, backgroundColor: COLORS.dangerBg, padding: 12 }}>
              <Text style={{ color: COLORS.danger, fontWeight: "800", fontSize: TAMANOS.cuerpo, lineHeight: 21, textAlign: "center" }}>{err}</Text>
            </View>
          ) : null}

          {/* 4) Pastillas de filtro con su recuento (en el móvil, en una fila deslizable) y «Más filtros». */}
          {!loading && !err ? (
            <View style={{ gap: 10 }}>
              <View style={isMobile ? { marginHorizontal: -16 } : undefined}>
                {(() => {
                  const filaPastillas = (
                    <View nativeID="pedidos-filtros" style={{ flexDirection: "row", flexWrap: isMobile ? "nowrap" : "wrap", gap: TACTIL.separacion }}>
                      {pastillas.map((c) => (
                        <Chip key={c.value} nativeID={`pedidos-filtro-${c.value}`} label={c.label} activo={!buscando && filtro === c.value} onPress={() => elegirFiltro(c.value)} />
                      ))}
                      <Chip
                        nativeID="pedidos-mas-filtros"
                        label={filtroExtra && nombreFiltroExtra ? `Más filtros · ${nombreFiltroExtra}` : filtroFactura !== "todas" ? "Más filtros · Factura" : "Más filtros"}
                        activo={!buscando && (filtroExtra || filtroFactura !== "todas")}
                        desplegable
                        abierto={masFiltros}
                        onPress={() => setMasFiltros((v) => !v)}
                      />
                    </View>
                  );
                  return isMobile ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
                      {filaPastillas}
                    </ScrollView>
                  ) : (
                    filaPastillas
                  );
                })()}
              </View>
              {masFiltros ? (
                <View nativeID="pedidos-filtros-mas" style={{ gap: 10, borderRadius: 16, backgroundColor: COLORS.card, padding: 12 }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
                    {otrosFiltros.map((c) => (
                      <Chip key={c.value} nativeID={`pedidos-filtro-${c.value}`} label={c.label} activo={!buscando && filtro === c.value} onPress={() => elegirFiltro(c.value)} />
                    ))}
                  </View>
                  {/* Facturas (las emite VeoAura): filtro que se suma al de arriba. */}
                  {facturasOk ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: TACTIL.separacion }}>
                      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>Factura:</Text>
                      {(
                        [
                          { value: "todas", label: "Todas" },
                          { value: "con", label: `Con factura (${resumenFacturas.con})` },
                          { value: "sin", label: `Sin factura (${resumenFacturas.sin})` },
                        ] as const
                      ).map((c) => (
                        <Chip key={c.value} nativeID={`pedidos-filtro-factura-${c.value}`} label={c.label} activo={filtroFactura === c.value} onPress={() => setFiltroFactura(c.value)} />
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* 5) Cuántos salen, «Abrir todos» y la lista de filas compactas. */}
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 12 }}>
              <Text nativeID="pedidos-recuento" style={{ flex: 1, minWidth: 140, color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                {loading ? "Cargando…" : buscando ? `${visibles.length} ${visibles.length === 1 ? "pedido encontrado" : "pedidos encontrados"}` : `${visibles.length} de ${pedidos.length} pedidos`}
              </Text>
              {!loading && visibles.length > 0 ? (
                <Pressable
                  nativeID="pedidos-abrir-todos"
                  onPress={abrirOCerrarTodos}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: todosVisiblesAbiertos }}
                  aria-expanded={todosVisiblesAbiertos}
                  style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.7 : 1 })}
                >
                  <Ionicons name={todosVisiblesAbiertos ? "contract-outline" : "expand-outline"} size={16} color={COLORS.accent} />
                  <Text style={{ color: COLORS.accentDark, fontWeight: "800", fontSize: TAMANOS.minimo }}>{todosVisiblesAbiertos ? "Cerrar todos" : "Abrir todos"}</Text>
                </Pressable>
              ) : null}
            </View>

            {loading ? (
              <View style={{ alignItems: "center", paddingVertical: 24 }}>
                <CargaMarca texto="Cargando pedidos…" />
              </View>
            ) : visibles.length === 0 && !err ? (
              <View nativeID="pedidos-vacio" style={{ alignItems: "center", gap: 6, paddingVertical: 28 }}>
                <Ionicons name="receipt-outline" size={24} color={COLORS.muted} />
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo, textAlign: "center" }}>No hay pedidos en esta lista.</Text>
                <Text style={{ color: COLORS.muted, fontSize: TAMANOS.cuerpo, lineHeight: 21, textAlign: "center" }}>Prueba a borrar el buscador o a elegir «Todos».</Text>
              </View>
            ) : (
              <View nativeID="pedidos-lista">
                {visibles.map((p, i) => (
                  <React.Fragment key={p.id}>
                    {/* Reparto de hoy: un encabezado por franja (mañana / tarde) con cuántos lleva, para planificar la ruta. */}
                    {filtro === "reparto_hoy" && !buscando && (i === 0 || visibles[i - 1].entrega_franja !== p.entrega_franja) ? (
                      <View nativeID={`pedidos-reparto-${p.entrega_franja}`} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: i ? 14 : 4, paddingBottom: 4 }}>
                        <Ionicons name={p.entrega_franja === "manana" ? "sunny-outline" : "partly-sunny-outline"} size={18} color={COLORS.accent} />
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>
                          {(nombreFranja(p.entrega_franja) ?? "").replace(/^./, (c) => c.toUpperCase())} · {visibles.filter((x) => x.entrega_franja === p.entrega_franja).length}{" "}
                          {visibles.filter((x) => x.entrega_franja === p.entrega_franja).length === 1 ? "pedido" : "pedidos"}
                        </Text>
                      </View>
                    ) : null}
                    {fila(p, filtro === "reparto_hoy" && !buscando && (i === 0 || visibles[i - 1].entrega_franja !== p.entrega_franja) ? 0 : i)}
                  </React.Fragment>
                ))}
              </View>
            )}
          </View>

          {/* 6) Más datos de los pedidos: los recuentos de siempre, en líneas de detalle. */}
          {!loading ? (
            <Seccion nativeID="pedidos-resumen" icon="stats-chart-outline" title="Más datos de los pedidos" extra={`${pedidos.length} últimos`}>
              <View style={{ gap: 8, borderRadius: 16, backgroundColor: COLORS.card, padding: 14 }}>
                <Detalle nativeID="pedidos-ingresos" color={COLORS.text}>
                  Ingresos de 30 días: {fmtEUR(cuentas.ingresos30)} en {cuentas.cobrados30} {cuentas.cobrados30 === 1 ? "pedido" : "pedidos"} (pagados online de verdad, ventas en tienda y
                  entregados; sin pruebas, cancelados, dobles ventas ni devueltos)
                </Detalle>
                {numerosOk ? (
                  <Detalle nativeID="pedidos-numeros">
                    Números de seguimiento · de VeoAura: {resumenNumeros.veoaura} (en la cuenta del cliente: {resumenNumeros.veoauraVinculados}) ·
                    añadidos con su número: {resumenNumeros.anadidosConNumero} · sin cuenta: {resumenNumeros.sinVincular} · asignados desde
                    el chat: {resumenNumeros.desdeChat}
                  </Detalle>
                ) : null}
                {pagoOk ? (
                  <Detalle nativeID="pedidos-pago-tarjeta">
                    Pago online (Stripe: tarjeta, Bizum o Klarna) · pagados: {resumenPago.pagados} (cobrado de verdad: {fmtEUR(resumenPago.cobradoReal)}; de prueba:{" "}
                    {resumenPago.dePrueba})
                    {resumenPago.porMetodo.card + resumenPago.porMetodo.bizum + resumenPago.porMetodo.klarna
                      ? ` · con tarjeta: ${resumenPago.porMetodo.card}, Bizum: ${resumenPago.porMetodo.bizum}, Klarna: ${resumenPago.porMetodo.klarna}`
                      : ""}{" "}
                    · empezados sin terminar: {resumenPago.sinTerminar}
                    {resumenPago.devueltos ? ` · devueltos: ${resumenPago.devueltos} (de verdad: ${fmtEUR(resumenPago.devueltoReal)})` : ""}
                    {resumenPago.porDevolver ? ` · por devolver: ${resumenPago.porDevolver}` : ""}
                  </Detalle>
                ) : null}
                {ventasOk ? (
                  <Detalle nativeID="pedidos-en-tienda">
                    Ventas en tienda (llegan de VeoAura) · {resumenTienda.total} ({fmtEUR(resumenTienda.importe)}) · en la cuenta del cliente:{" "}
                    {resumenTienda.unidas} · pendientes de que se registre: {resumenTienda.pendientes}
                  </Detalle>
                ) : null}
                {historial ? (
                  <Detalle nativeID="pedidos-seguimiento">
                    Seguimiento paso a paso · con la hora de algún cambio: {pedidos.filter((p) => (historial[p.id] ?? []).length > 0).length} · con número de
                    envío: {pedidos.filter((p) => !!numerosEnvio[p.id]).length}
                  </Detalle>
                ) : null}
                {valoraciones && Object.keys(valoraciones).length > 0 ? (
                  <Detalle nativeID="pedidos-valoraciones">
                    Valoraciones: {Object.keys(valoraciones).length} · media{" "}
                    {(Object.values(valoraciones).reduce((s, v) => s + v.nota, 0) / Object.keys(valoraciones).length).toFixed(1).replace(".", ",")} de 5 · bajas
                    (1-2): {Object.values(valoraciones).filter((v) => v.nota <= 2).length}
                  </Detalle>
                ) : null}
                {avisosRepo ? (
                  <Detalle nativeID="pedidos-avisos-reposicion" color={COLORS.text}>
                    {`Avisos de reposición: ${avisosRepo.filter((a) => a.activo).length} activos · por app ${avisosRepo.filter((a) => a.activo && a.canal === "app").length} · por correo ${
                      avisosRepo.filter((a) => a.activo && a.canal === "correo").length
                    } · ambas ${avisosRepo.filter((a) => a.activo && a.canal === "ambas").length} · avisados ${avisosRepo.filter((a) => !!a.avisado_en).length}`}
                    {avisosRepo.some((a) => a.activo && a.canal !== "app") ? " · Correo pendiente de activar en la tienda (Blue les avisa en la app)" : ""}
                  </Detalle>
                ) : null}
                {facturasOk ? (
                  <Detalle nativeID="pedidos-facturas">
                    Facturas de VeoAura · con factura: {resumenFacturas.con}
                    {resumenFacturas.pdfPendiente ? ` (PDF pendiente: ${resumenFacturas.pdfPendiente})` : ""} · sin factura: {resumenFacturas.sin}
                  </Detalle>
                ) : null}
                {/* Dueño, 2026-11-03: «Entregado» cuenta como pagado; si el pedido lleva artículos de VeoAura, su ficha de cliente
                    (nombre, correo y teléfono) va a VeoAura (api/escaparate-retorno.ts). Se ve en Administración → Escaparate. */}
                <Detalle nativeID="pedidos-veoaura-cliente">
                  Al marcar «Entregado» un pedido con artículos de VeoAura, se envían a VeoAura el nombre, el correo y el teléfono del
                  cliente (nunca su dirección).
                </Detalle>
              </View>
            </Seccion>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
