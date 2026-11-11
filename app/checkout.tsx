/**
 * app/checkout.tsx
 *
 * Qué hace: pantalla de checkout (finalizar compra). Lee el carrito guardado
 * en AsyncStorage, pide los datos de envío (nombre, email, teléfono,
 * dirección) y, al confirmar, registra el pedido y muestra la confirmación.
 *
 * Pago con tarjeta (Stripe, dueño 2026-11-05; api/pago.ts): si el servidor dice que está disponible, el botón principal
 * es «Pagar con tarjeta»: se guarda el pedido como siempre y se abre la página de pago segura de Stripe con el total que
 * pone el servidor (nunca el del navegador). Al volver (?pago=ok&sesion=… o ?pago=cancelado), el servidor se lo
 * pregunta a Stripe y solo entonces sale «pagado». «Confirmar sin pagar ahora» sigue como antes (pago por el chat). Con
 * la clave de prueba de Stripe solo lo ve el administrador. Se mide con la analítica propia (pago_tarjeta y
 * pago_tarjeta_ok, Administración → Analítica) y cada pedido enseña su pago en Administración → Pedidos.
 * Debajo del botón se dice con qué se puede pagar en la página de Stripe (textoMetodosPago): tarjeta y Apple Pay y, solo
 * si el servidor los ofrece, Bizum (2026-11-11) y Klarna a plazos (2026-11-06). Con qué se pagó de verdad se ve en
 * Administración → Pedidos y se cuenta en Analítica.
 *
 * Cómo funciona: guarda el carrito en local con la misma clave que usa
 * cesta.tsx (CART_KEY = "videojuegoos_cart_v1"), valida el formulario campo
 * a campo (formOk) y construye el resumen del pedido (buildTextoPedido). En la
 * confirmación, "Hablar con el equipo" lo manda al chat de la tienda
 * (abrirChatEquipo, el mismo de Blue IA); sin sesión lleva a Blue IA con
 * ?pedido=<referencia>. Sin WhatsApp ni teléfono (dueño, 2026-11-11).
 *
 * Confirmación y «No se ha hecho el pago» (dueño, 2026-11-11: «intuitiva, práctica y profesional»): el título dice qué
 * ha pasado («¡Gracias por tu pedido!», «¡Gracias por tu compra!» si ya está pagado, «No se ha hecho el pago», «No se ha podido abrir el pago», «Aún no nos
 * consta el pago», «No hemos podido guardar tu pedido»), debajo la referencia «Pedido VZ-XXXX-XXXX» (la pide a
 * api/pago.ts, acción «referencia», solo para quien hizo el pedido; el número interno nunca se enseña) y si se ha cobrado
 * o no; UNA sola píldora azul con lo siguiente («Volver a intentar el pago», «Comprobar otra vez», «Volver a
 * intentarlo» o «Hablar con el equipo») y lo demás como texto con icono. En el formulario, debajo del botón, lo que se
 * acepta al confirmar con sus páginas (Condiciones y Privacidad).
 *
 * "Comprar ya" → vendido automático: si el producto se añadió con el botón
 * "Comprar ya" de app/producto/[id].tsx (que ya exige sesión iniciada),
 * queda un marcador en AsyncStorage (BUY_NOW_MARK_KEY). Al confirmar aquí el
 * pedido, si ese marcador sigue apuntando a un producto que todavía está en
 * el carrito y la sesión coincide, se inserta solo en product_sales (ver
 * sql/product_sales.sql) — así ese producto queda marcado como vendido a
 * esa persona sin que Jefe tenga que hacerlo a mano. Si el pedido viene solo
 * de "Añadir a la cesta" (sin pasar por "Comprar ya"), no hay marcador y no
 * se marca nada automáticamente: esas ventas se siguen marcando a mano
 * desde el chat del producto o desde el panel de Productos.
 *
 * Con sesión iniciada, los campos vacíos se rellenan solos: nombre y correo de la cuenta y la dirección de envío de
 * «Mi perfil» (código postal, localidad, dirección y piso; components/PerfilPublico.tsx), con un aviso «Con la
 * dirección de tu perfil». Se mide con la analítica propia («pago_direccion_perfil», Administración → Usuarios).
 *
 * Envío (dueño, 2026-11-04): se calcula solo con las tarifas de Administración → Tarifas de envío (lib/envio.ts):
 * entrega en mano o, a domicilio, por el código postal y el importe. Al guardar el pedido lo calcula también la base de
 * datos con la misma regla (es lo que vale). Si la tienda no envía a esa zona desde la web, se pide escribir antes.
 *
 * Desplazamiento (dueño, 2026-11-04: «que el scroll funcione perfectamente como cualquier otra página»): todo va dentro
 * del mismo desplazamiento (cabecera, resumen con la miniatura de cada artículo, entrega y el botón al final), como
 * Servicios o Quiénes somos; los campos van a 16 px (el iPhone no amplía la página al escribir) y en la web el teclado
 * no se cierra al desplazar (la propia web desplaza al campo que se toca).
 *
 * Conectado con:
 * - app/(tabs)/cesta.tsx → de donde viene el carrito guardado.
 * - app/catalogo.tsx → a donde vuelve el usuario si el carrito está vacío
 *   o si pulsa "Seguir viendo".
 * - app/producto/[id].tsx → deja el marcador de "Comprar ya".
 * - sql/product_sales.sql → tabla e INSERT del vendido automático.
 * - @react-native-async-storage/async-storage → persistencia del carrito.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CargaMarca from "../components/marca/CargaMarca";
import CabeceraMarca from "../components/CabeceraMarca";
import MarcaAnimada from "../components/marca/MarcaAnimada";
import SmartImage from "../components/SmartImage";
import { abrirChatEquipo } from "../components/ProductChatThread";
import { calcularEnvio, cargarDatosEnvio, cargarTarifas, fmtKg, hayEnviosDePago, limpiarCodigoPostal, pesoDeCompra, type ZonaEnvio } from "../lib/envio";
import { supabase } from "../lib/supabase";
import { RESERVA_MINUTOS, reservarProducto } from "../lib/reservas";
import { trackEvent } from "../lib/analytics";
import { datosDeFila } from "../components/PerfilPublico";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  // Mismo azul oscuro de botón principal que la ficha de producto.
  accentDark: "#1EA7E8",
  danger: "#DC2626",
  success: "#15803D",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  inputBg: "#F6FAFD",
};

type CartItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  priceEUR: number;
  qty: number;
  imageUrl?: string | null;
  // Fin de la reserva de 15 minutos (ms), ver lib/reservas.ts.
  reservedUntil?: number;
};

const CART_KEY = "videojuegoos_cart_v1";
const BUY_NOW_MARK_KEY = "videojuegoos_buy_now_mark_v1";

type BuyNowMark = { productId: string; userId: string };

// Si el pedido incluye el producto de "Comprar ya" y la sesión coincide,
// lo marca como vendido a esa persona (ver sql/product_sales.sql). No
// bloquea ni avisa si falla: es un extra sobre el pedido guardado, que es
// lo que de verdad cierra la venta.
async function markBuyNowSoldIfApplies(items: CartItem[]) {
  try {
    const raw = await AsyncStorage.getItem(BUY_NOW_MARK_KEY);
    if (!raw) return;

    const mark = JSON.parse(raw) as BuyNowMark;
    if (!mark?.productId || !mark?.userId) return;
    if (!items.some((it) => it.id === mark.productId)) return;

    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user?.id !== mark.userId) return;

    await supabase.from("product_sales").insert({ product_id: mark.productId });
  } catch (e) {
    console.error("Error marcando la venta automática de Comprar ya:", e);
  } finally {
    await AsyncStorage.removeItem(BUY_NOW_MARK_KEY);
  }
}

// Clave única de la operación de compra. Se manda en cada intento de crear el pedido y el servidor
// (crear_pedido_idempotente, supabase/migrations/20261018110000_pedidos_idempotencia.sql) crea UN solo
// pedido por clave: un reintento tras un corte de red, una recarga o dos toques seguidos devuelven el
// mismo número en lugar de crear otro pedido.
const PEDIDO_CLAVE_KEY = "videojuegoszaragoza:pedido_clave";
const PEDIDO_CLAVE_MINUTOS = 30;

function nuevoUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Sin crypto.randomUUID (móvil nativo): UUID v4 con números aleatorios.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// La misma clave mientras el carrito no cambie (30 min): así reintentar, aunque se recargue la página,
// no crea otro pedido. Una clave nueva si cambia el carrito. Cambiar los datos (teléfono, dirección,
// envío↔recogida) NO cambia la clave: si la respuesta se perdió, el servidor corrige ese mismo pedido
// en vez de crear otro.
type ClaveGuardada = { clave: string; huella: string; creada: number };
// Copia en memoria por si el navegador no deja guardar (modo privado, almacenamiento bloqueado): así
// los reintentos de esta pantalla siguen mandando la misma clave.
let claveEnMemoria: ClaveGuardada | null = null;

async function claveDelPedido(items: CartItem[]): Promise<string> {
  const huella = items.map((it) => it.id).sort().join(",");
  const vale = (g: Partial<ClaveGuardada> | null | undefined): g is ClaveGuardada =>
    !!g?.clave && g.huella === huella && typeof g.creada === "number" && Date.now() - g.creada < PEDIDO_CLAVE_MINUTOS * 60000;
  try {
    const raw = await AsyncStorage.getItem(PEDIDO_CLAVE_KEY);
    const g = raw ? (JSON.parse(raw) as Partial<ClaveGuardada>) : null;
    if (vale(g)) {
      claveEnMemoria = g;
      return g.clave;
    }
  } catch {
    // sin clave guardada: se mira la de memoria o se crea una nueva
  }
  if (vale(claveEnMemoria)) return claveEnMemoria.clave;
  const nueva: ClaveGuardada = { clave: nuevoUuid(), huella, creada: Date.now() };
  claveEnMemoria = nueva;
  try {
    await AsyncStorage.setItem(PEDIDO_CLAVE_KEY, JSON.stringify(nueva));
  } catch {
    // sin almacenamiento: vale la copia en memoria para los reintentos de esta pantalla
  }
  return nueva.clave;
}

// ¿Falla porque la función nueva aún no existe en la base de datos (migración sin aplicar) o ya no
// tiene permiso (vuelta atrás)? Entonces se usa la antigua, sin idempotencia.
function funcionNoDisponible(e: { code?: string; message?: string }): boolean {
  return e.code === "PGRST202" || e.code === "42883" || e.code === "42501" || /could not find the function|permission denied/i.test(e.message ?? "");
}

// --- Pago con tarjeta (api/pago.ts, Stripe) ---------------------------------------------------------------------------
// klarna / bizum: la página de pago también ofrece Klarna / Bizum (solo cuando la privacidad ya los nombra y, Bizum,
// cuando Stripe no lo ha rechazado; api/pago.ts). Sin ellos no se prometen.
type PagoTarjeta = { disponible: boolean; modo: "prueba" | "real" | null; klarna?: boolean; bizum?: boolean };

// «Pago seguro en la página de Stripe con tarjeta, Apple Pay, Bizum o Klarna (también a plazos)…», solo con lo que se ofrece.
function textoMetodosPago(p: PagoTarjeta): string {
  const m = ["tarjeta", "Apple Pay"];
  if (p.bizum) m.push("Bizum");
  if (p.klarna) m.push("Klarna (también a plazos)");
  return `Pago seguro en la página de Stripe con ${m.slice(0, -1).join(", ")} o ${m[m.length - 1]}. La tienda nunca ve los datos de tu tarjeta.`;
}
// En la confirmación: null = pedido sin pago con tarjeta (como siempre); el resto, cómo va el pago.
type EstadoPago = "comprobando" | "pagado" | "sin_confirmar" | "cancelado" | "sin_abrir" | null;

// El pedido que se está pagando, para volver a intentarlo si se cancela en la página de Stripe y para contar el pago una
// sola vez al volver. Solo el número y la clave de la compra (que ya guarda este navegador), nunca datos de la tarjeta.
const PAGO_PENDIENTE_KEY = "videojuegoszaragoza:pago_pendiente";
type PagoPendiente = { numero: number; clave: string | null; creado: number };

async function cabecerasConSesion(): Promise<Record<string, string>> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) h.Authorization = `Bearer ${token}`;
  } catch {
    // sin sesión: el pago se reconoce por la clave de la compra
  }
  return h;
}

async function leerPagoPendiente(): Promise<PagoPendiente | null> {
  try {
    const raw = await AsyncStorage.getItem(PAGO_PENDIENTE_KEY);
    const g = raw ? (JSON.parse(raw) as Partial<PagoPendiente>) : null;
    // Un día como mucho: después, el pedido se habla por el chat.
    if (g && Number.isInteger(g.numero) && typeof g.creado === "number" && Date.now() - g.creado < 86_400_000) {
      return { numero: Number(g.numero), clave: typeof g.clave === "string" ? g.clave : null, creado: g.creado };
    }
  } catch {
    // nada guardado
  }
  return null;
}

// Abre la página de pago de Stripe para ese pedido (el importe lo pone el servidor con el total guardado). Antes de salir
// de la tienda espera a que la analítica apunte lo que tenga pendiente (`medir`, como mucho 1,5 s: si no, el navegador
// lo cortaría al cambiar de página). Devuelve «redirigiendo», «pagado» (ya lo estaba) o el aviso para el cliente.
async function irAlPagoConTarjeta(
  numero: number,
  clave: string | null,
  medir: Promise<unknown>
): Promise<"redirigiendo" | "pagado" | { aviso: string }> {
  try {
    const r = await fetch("/api/pago", {
      method: "POST",
      headers: await cabecerasConSesion(),
      body: JSON.stringify({ accion: "crear", numero, clave }),
    });
    const d = (await r.json().catch(() => null)) as { ok?: boolean; url?: string; pagado?: boolean } | null;
    if (r.ok && d?.pagado) return "pagado";
    if (r.ok && typeof d?.url === "string" && /^https:\/\/checkout\.stripe\.com\//.test(d.url)) {
      try {
        await AsyncStorage.setItem(PAGO_PENDIENTE_KEY, JSON.stringify({ numero, clave, creado: Date.now() }));
      } catch {
        // sin almacenamiento: al volver se confirma igual (la vuelta trae la sesión de Stripe)
      }
      await Promise.race([medir, new Promise((fin) => setTimeout(fin, 1500))]);
      window.location.assign(d.url);
      return "redirigiendo";
    }
    if (r.status === 429) return { aviso: "Demasiados intentos seguidos. Espera unos minutos y vuelve a probar." };
  } catch {
    // sin conexión: abajo
  }
  return { aviso: AVISO_SIN_ABRIR };
}

// Referencia del pedido que ve el cliente («VZ-XXXX-XXXX», pedidos.codigo_seguimiento). El número interno (numero) solo
// se usa por dentro: nunca se enseña (dueño, 2026-11-11: «como una empresa profesional»).
const REFERENCIA_RE = /^VZ-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const refValida = (v: unknown): string | null => (typeof v === "string" && REFERENCIA_RE.test(v) ? v : null);

// Al volver de Stripe: el servidor se lo pregunta a Stripe (la vuelta del navegador por sí sola no vale).
async function confirmarPagoConTarjeta(sesion: string): Promise<{ pagado: boolean; numero: number | null; referencia: string | null } | null> {
  if (!/^cs_(test|live)_[A-Za-z0-9]{8,240}$/.test(sesion)) return null;
  try {
    const r = await fetch("/api/pago", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "confirmar", sesion }),
    });
    const d = (await r.json().catch(() => null)) as { ok?: boolean; pagado?: boolean; numero?: number; referencia?: string } | null;
    if (r.ok && d?.ok) return { pagado: d.pagado === true, numero: Number(d.numero) || null, referencia: refValida(d.referencia) };
  } catch {
    // sin conexión: se puede comprobar otra vez
  }
  return null;
}

// La referencia de un pedido recién hecho: la da el servidor (api/pago.ts, «referencia») solo a quien lo hizo (su cuenta
// o la clave de la compra que guarda este navegador). Sin ella, la pantalla dice «tu pedido» sin número.
async function referenciaDelPedido(numero: number, clave: string | null): Promise<string | null> {
  if (Platform.OS !== "web") return null;
  try {
    const r = await fetch("/api/pago", {
      method: "POST",
      headers: await cabecerasConSesion(),
      body: JSON.stringify({ accion: "referencia", numero, clave }),
    });
    const d = (await r.json().catch(() => null)) as { ok?: boolean; referencia?: string } | null;
    if (r.ok && d?.ok) return refValida(d.referencia);
  } catch {
    // sin conexión: sin referencia en pantalla (el pedido está guardado igual)
  }
  return null;
}

// Resumen corto del pedido para el chat de la tienda cuando la cesta ya no está (al volver de Stripe).
function textoDelPedido(referencia: string | null, pago: EstadoPago): string {
  const base = referencia ? `Hola, tengo el pedido ${referencia} en Videojuegoszaragoza.com.` : "Hola, tengo un pedido en Videojuegoszaragoza.com.";
  if (pago === "pagado") return `${base} Ya lo he pagado online. ¿Me confirmáis la entrega?`;
  if (pago === "cancelado" || pago === "sin_abrir") return `${base} No he podido terminar el pago online. ¿Me ayudáis a pagarlo?`;
  return `${base} ¿Me confirmáis la disponibilidad, el pago y la entrega?`;
}

// Aviso de «no se ha podido abrir la página de pago» (en la pantalla «No se ha podido abrir el pago» ya lo dice el título).
const AVISO_SIN_ABRIR = "No hemos podido abrir la página de pago. Vuelve a intentarlo en un momento.";

// Precio siempre con dos decimales, coma decimal y miles con punto (155,00€ · 1.299,00€).
function fmtEUR(n: number) {
  const v = Number(n);
  const cents = Math.round((Number.isFinite(v) ? v : 0) * 100);
  const [ent, dec] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${cents < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

function safeStr(v: unknown) {
  return String(v ?? "").trim();
}

function isValidEmail(email: string) {
  const s = email.trim();
  if (!s) return false;
  // validación pragmática
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isValidPhone(phone: string) {
  const digits = phone.replace(/[^\d]/g, "");
  // España típico 9 dígitos, pero dejamos margen
  return digits.length >= 9 && digits.length <= 15;
}

/**
 * Back inteligente:
 * - Si hay stack: back()
 * - Si entraste por URL directa/refresh: vuelve al Home "/"
 */
function smartBackToHome() {
  try {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // no-op
  }
  router.replace("/");
}

async function loadCart(): Promise<CartItem[]> {
  try {
    const raw = await AsyncStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((it: any) => ({
        id: String(it?.id ?? ""),
        title: String(it?.title ?? ""),
        subtitle: it?.subtitle ?? null,
        priceEUR: Number(it?.priceEUR ?? 0),
        qty: Math.max(1, Math.floor(Number(it?.qty ?? 1))),
        imageUrl: typeof it?.imageUrl === "string" ? it.imageUrl : null,
        reservedUntil: Number.isFinite(Number(it?.reservedUntil)) ? Number(it.reservedUntil) : undefined,
      }))
      .filter((it: CartItem) => it.id && it.title);
  } catch {
    return [];
  }
}

async function saveCart(items: CartItem[]) {
  try {
    await AsyncStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    // no-op
  }
}

export default function CheckoutScreen() {
  useWindowDimensions(); // fuerza re-render en cambios de tamaño (web/responsive)
  const insets = useSafeAreaInsets();
  // Columna centrada: en desktop el checkout no se estira de borde a borde,
  // se queda como una columna centrada (igual que cualquier checkout premium).
  const columnStyle = {
    width: "100%" as const,
    maxWidth: 640,
    alignSelf: "center" as const,
  };

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [items, setItems] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Form (MVP)
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address1, setAddress1] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");
  // Envío a domicilio o entrega en mano en Cuarte de Huerva (la tienda es solo online: no hay tienda física). En la
  // base de datos la entrega en mano sigue llamándose «recogida»; con ella no se pide dirección.
  const [entrega, setEntrega] = useState<"envio" | "recogida">("envio");
  // Número del pedido ya registrado (pantalla de confirmación), con cómo va su pago con tarjeta y la clave de la compra
  // (para volver a intentar el pago).
  // referencia: la del pedido que ve el cliente (VZ-XXXX-XXXX); numero solo se usa por dentro (pagar, volver de Stripe).
  const [pedidoHecho, setPedidoHecho] = useState<{ numero: number | null; referencia?: string | null; texto: string; pago?: EstadoPago; clave?: string | null } | null>(null);
  // Pago con tarjeta: si el servidor lo ofrece a quien mira (con la clave de prueba, solo al administrador).
  const [pagoTarjeta, setPagoTarjeta] = useState<PagoTarjeta>({ disponible: false, modo: null });
  const [avisoPago, setAvisoPago] = useState<string | null>(null);
  // Saliendo hacia la página de Stripe (el botón se queda cargando hasta que el navegador cambia de página).
  const [redirigiendo, setRedirigiendo] = useState(false);
  const params = useLocalSearchParams<{ pago?: string; sesion?: string; pedido?: string }>();

  const bootedRef = useRef(false);
  // Guarda síncrona contra dos toques seguidos, como defensa extra: el botón ya se desactiva con
  // `submitting`, pero ese estado de React se actualiza con retraso. (Con la simulación de una compra
  // en el navegador, el doble toque no llegó a duplicar nada ni sin esta guarda: el hueco real era
  // el servidor, que aceptaba cualquier reintento; ver crear_pedido_idempotente.)
  const enviandoRef = useRef(false);

  const subtotal = useMemo(
    () => items.reduce((acc, it) => acc + it.priceEUR * it.qty, 0),
    [items]
  );

  // Envío: con las tarifas de la tienda (Administración → Tarifas de envío), por la entrega, el código postal y el
  // importe. Sin la migración, gratis como antes. Lo que se guarda lo calcula la base de datos con la misma regla.
  const [tarifas, setTarifas] = useState<ZonaEnvio[] | null>(null);
  useEffect(() => {
    let vivo = true;
    cargarTarifas().then((t) => {
      if (vivo) setTarifas(t);
    });
    return () => {
      vivo = false;
    };
  }, []);
  // Envío por kilos (Correos): el peso de la compra con el de cada artículo (products.peso_kg; sin peso, 2 kg).
  const idsCesta = items.map((it) => it.id).join(",");
  const [pesos, setPesos] = useState<Record<string, number | null>>({});
  // Artículos que solo se entregan en mano (televisores sin su caja original): con ellos no hay envío a domicilio.
  const [soloMano, setSoloMano] = useState<string[]>([]);
  useEffect(() => {
    let vivo = true;
    cargarDatosEnvio(idsCesta ? idsCesta.split(",") : []).then((d) => {
      if (!vivo) return;
      setPesos(d.pesos);
      setSoloMano(d.soloMano);
    });
    return () => {
      vivo = false;
    };
  }, [idsCesta]);
  // Uno por artículo, como pedido_items en la base de datos (cada artículo es unidad única).
  const pesoKg = useMemo(() => pesoDeCompra(items.map((it) => pesos[it.id] ?? null)), [items, pesos]);
  const envio = useMemo(
    () => calcularEnvio(tarifas, { entrega, codigoPostal: postalCode, productos: subtotal, pesoKg }),
    [tarifas, entrega, postalCode, subtotal, pesoKg]
  );
  // A domicilio y con envíos de pago: hasta tener un código postal de 5 cifras, el envío aún no se sabe.
  const faltaCodigo = entrega === "envio" && hayEnviosDePago(tarifas) && limpiarCodigoPostal(postalCode).length !== 5;
  const shipping = faltaCodigo ? 0 : envio.precio;
  const total = subtotal + shipping;
  // A domicilio con un artículo que solo se entrega en mano: no se puede (se elige «Entrega en mano» o se escribe).
  const articulosSoloMano = items.filter((it) => soloMano.includes(it.id));
  const bloqueoSoloMano = entrega === "envio" && articulosSoloMano.length > 0;

  const formOk = useMemo(() => {
    if (items.length === 0) return false;
    // La tienda no envía a esa zona desde la web: se pide escribir antes (ver el aviso de la entrega). Con envíos de
    // pago, sin un código postal completo no se sabe el envío (ni el total).
    if (!envio.disponible || faltaCodigo || bloqueoSoloMano) return false;

    const nameOk = safeStr(fullName).length >= 2;
    const emailOk = isValidEmail(email);
    const phoneOk = isValidPhone(phone);

    if (entrega === "recogida") return nameOk && emailOk && phoneOk;

    const addrOk = safeStr(address1).length >= 6;
    const cpOk = safeStr(postalCode).length >= 4;
    const cityOk = safeStr(city).length >= 2;

    return nameOk && emailOk && phoneOk && addrOk && cpOk && cityOk;
  }, [items.length, fullName, email, phone, address1, postalCode, city, entrega, envio.disponible, faltaCodigo, bloqueoSoloMano]);

  // Resumen del pedido que se manda al chat de la tienda con «Hablar con el equipo» (con la referencia, nunca el número
  // interno). Sin referencia (no se pudo guardar), lleva los datos para que el equipo lo termine con el cliente.
  const buildTextoPedido = useCallback((referencia: string | null, guardado: boolean) => {
    const lines: string[] = [];
    lines.push(
      referencia
        ? `Hola, acabo de hacer el pedido ${referencia} en Videojuegoszaragoza.com.`
        : guardado
          ? "Hola, acabo de hacer un pedido en Videojuegoszaragoza.com."
          : "Hola, quiero hacer este pedido en Videojuegoszaragoza.com (la web no ha podido guardarlo)."
    );
    lines.push("");
    lines.push(entrega === "recogida" ? "Entrega: en mano en Cuarte de Huerva" : "Entrega: envío a domicilio");
    lines.push("");
    if (items.length > 0) {
      lines.push("Pedido:");
      for (const it of items) {
        lines.push(`- ${it.title} x${it.qty} (${fmtEUR(it.priceEUR * it.qty)})`);
      }
      lines.push(`Envío: ${shipping === 0 ? "gratis" : fmtEUR(shipping)}`);
      lines.push(`Total: ${fmtEUR(total)}`);
      lines.push("");
    }
    lines.push("Datos:");
    if (safeStr(fullName)) lines.push(`Nombre: ${safeStr(fullName)}`);
    if (safeStr(email)) lines.push(`Email: ${safeStr(email)}`);
    if (safeStr(phone)) lines.push(`Tel: ${safeStr(phone)}`);
    if (entrega === "envio") {
      if (safeStr(address1)) lines.push(`Dirección: ${safeStr(address1)}`);
      if (safeStr(postalCode) || safeStr(city)) lines.push(`CP/Ciudad: ${safeStr(postalCode)} ${safeStr(city)}`.trim());
    }
    if (safeStr(notes)) {
      lines.push("");
      lines.push(`Notas: ${safeStr(notes)}`);
    }
    lines.push("");
    lines.push(
      entrega === "recogida"
        ? "¿Me confirmáis la disponibilidad, el pago y cuándo me lo entregáis en mano?"
        : "¿Me confirmáis la disponibilidad, el pago y el envío?"
    );
    return lines.join("\n");
  }, [items, total, shipping, fullName, email, phone, address1, postalCode, city, notes, entrega]);

  // Abre el chat de la tienda con el pedido; sin sesión, Blue IA con el pedido como contexto.
  const [abriendoChat, setAbriendoChat] = useState(false);
  // En la confirmación, «Pagar ahora» se ofrece tras cancelar en Stripe, si no se pudo abrir o si aún no consta el pago.
  const ofreceReintento =
    pagoTarjeta.disponible &&
    !!pedidoHecho?.numero &&
    (pedidoHecho.pago === "cancelado" || pedidoHecho.pago === "sin_abrir" || pedidoHecho.pago === "sin_confirmar");
  const hablarConNosotros = useCallback(async () => {
    if (!pedidoHecho || abriendoChat) return;
    setAbriendoChat(true);
    try {
      // El chat de la tienda (el mismo «Hablar con el equipo» de Blue IA y de la ficha); sin sesión, Blue IA con el
      // pedido de contexto, desde donde también se habla con el equipo.
      const r = await abrirChatEquipo({ resumen: pedidoHecho.texto });
      if (r === "login") {
        router.push(
          (pedidoHecho.referencia
            ? `/blue-ia?pedido=${encodeURIComponent(pedidoHecho.referencia)}`
            : `/blue-ia?tema=${encodeURIComponent("Mi pedido")}`) as never
        );
      }
    } catch (e) {
      console.error("Error abriendo el chat del pedido:", e);
      setErr("No hemos podido abrir el chat ahora mismo. Inténtalo de nuevo.");
    } finally {
      setAbriendoChat(false);
    }
  }, [pedidoHecho, abriendoChat]);

  const bootstrap = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      // Cestas anteriores a la reserva de 15 minutos: se reservan ahora.
      const loaded = await loadCart();
      const stored: CartItem[] = [];
      for (const it of loaded) {
        if (it.reservedUntil) {
          stored.push(it);
          continue;
        }
        const r = await reservarProducto(it.id);
        if (r.ok) stored.push({ ...it, reservedUntil: r.hasta });
      }
      if (stored.length !== loaded.length || stored.some((it, i) => it !== loaded[i])) {
        await saveCart(stored);
      }
      setItems(stored);
      if (stored.length) {
        trackEvent("begin_checkout", "Inicio de compra", {
          path: "/checkout",
          metadata: { items: stored.length, total: stored.reduce((a, it) => a + it.priceEUR * it.qty, 0) },
        });
      }
    } catch (e: any) {
      console.error("Error cargando el checkout:", e);
      setErr("No hemos podido cargar el proceso de compra. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    bootstrap();
  }, [bootstrap]);

  // Con sesión iniciada, los datos se rellenan solos con los de la cuenta y la dirección de envío de «Mi perfil»
  // (components/PerfilPublico.tsx), como en Amazon. Solo los campos vacíos: nunca se pisa lo que ya se haya escrito.
  const [desdePerfil, setDesdePerfil] = useState(false);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const user = s.session?.user;
        if (!user || !vivo) return;
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
        // «*»: funciona antes y después de la migración de la dirección (sin pedir columnas que aún no existen).
        const { data } = await supabase.from("perfiles_cliente").select("*").eq("user_id", user.id).maybeSingle();
        if (!vivo) return;
        const p = datosDeFila((data ?? {}) as Record<string, unknown>);
        const nombre = p.nombre || (typeof meta.full_name === "string" ? meta.full_name.trim() : "");
        if (nombre) setFullName((v) => v || nombre);
        if (user.email) setEmail((v) => v || user.email || "");
        if (p.direccion && p.codigoPostal) {
          const linea = [p.direccion, p.piso].filter(Boolean).join(", ");
          setAddress1((v) => v || linea);
          setPostalCode((v) => v || p.codigoPostal);
          if (p.localidad) setCity((v) => v || p.localidad);
          setDesdePerfil(true);
          trackEvent("pago_direccion_perfil", "Pago: dirección del perfil", { path: "/checkout" });
        }
      } catch {
        // sin datos: se escriben a mano, como siempre
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // ¿Se puede pagar con tarjeta? Lo dice el servidor (clave de Stripe puesta, columnas de pago y, en modo prueba, que
  // quien mira sea el administrador). Solo en la web: la página de Stripe se abre en el navegador.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/pago", { headers: await cabecerasConSesion() });
        const d = (await r.json().catch(() => null)) as { ok?: boolean; disponible?: boolean; modo?: string; klarna?: boolean; bizum?: boolean } | null;
        if (vivo && r.ok && d?.ok) {
          setPagoTarjeta({ disponible: d.disponible === true, modo: d.modo === "prueba" || d.modo === "real" ? d.modo : null, klarna: d.klarna === true, bizum: d.bizum === true });
        }
      } catch {
        // sin servidor: como siempre, sin pago con tarjeta
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Vuelta de Stripe: ?pago=ok&sesion=cs_… (el servidor se lo pregunta a Stripe) o ?pago=cancelado&pedido=N.
  const vueltaRef = useRef("");
  const comprobarVuelta = useCallback(async (sesion: string) => {
    const pendiente = await leerPagoPendiente();
    const numeroGuardado = pendiente?.numero ?? null;
    setPedidoHecho((p) => ({ numero: numeroGuardado, referencia: p?.referencia ?? null, texto: textoDelPedido(p?.referencia ?? null, null), pago: "comprobando", clave: pendiente?.clave ?? null }));
    const r = await confirmarPagoConTarjeta(sesion);
    const numero = r?.numero ?? numeroGuardado;
    // La referencia la da la confirmación; si no llegó, se pide aparte (solo a quien hizo el pedido).
    const referencia = r?.referencia ?? (numero ? await referenciaDelPedido(numero, pendiente?.clave ?? null) : null);
    if (r?.pagado) {
      // Se cuenta una sola vez: al recargar esta página ya no hay pago pendiente guardado.
      if (pendiente) {
        trackEvent("pago_tarjeta_ok", "Pagado online", { path: "/checkout", metadata: { numero, modo: sesion.startsWith("cs_live_") ? "real" : "prueba" } });
        try {
          await AsyncStorage.removeItem(PAGO_PENDIENTE_KEY);
        } catch {
          // nada que borrar
        }
      }
      setPedidoHecho({ numero, referencia, texto: textoDelPedido(referencia, "pagado"), pago: "pagado", clave: null });
    } else {
      setPedidoHecho({ numero, referencia, texto: textoDelPedido(referencia, null), pago: "sin_confirmar", clave: pendiente?.clave ?? null });
    }
  }, []);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const pago = typeof params.pago === "string" ? params.pago : "";
    const sesion = typeof params.sesion === "string" ? params.sesion : "";
    const clave = `${pago}|${sesion}|${params.pedido ?? ""}`;
    if ((pago !== "ok" && pago !== "cancelado") || vueltaRef.current === clave) return;
    vueltaRef.current = clave;
    if (pago === "ok") {
      comprobarVuelta(sesion);
      return;
    }
    (async () => {
      const pendiente = await leerPagoPendiente();
      const enLaUrl = Number(params.pedido);
      const numero = pendiente?.numero ?? (Number.isInteger(enLaUrl) && enLaUrl > 0 ? enLaUrl : null);
      // Se enseña ya y la referencia llega enseguida (sin dejar la cesta vacía en pantalla mientras tanto).
      setPedidoHecho({ numero, referencia: null, texto: textoDelPedido(null, "cancelado"), pago: "cancelado", clave: pendiente?.clave ?? null });
      const referencia = numero ? await referenciaDelPedido(numero, pendiente?.clave ?? null) : null;
      if (referencia) setPedidoHecho((p) => (p && p.numero === numero ? { ...p, referencia, texto: textoDelPedido(referencia, p.pago ?? null) } : p));
    })();
  }, [params.pago, params.sesion, params.pedido, comprobarVuelta]);

  // Vuelta atrás desde la página de Stripe: el navegador puede devolver esta página tal cual estaba (caché de páginas),
  // con «Abriendo el pago…» en pantalla. El pedido sigue guardado y sin pagar: se enseña para volver a intentarlo.
  const pagoEnCursoRef = useRef<{ numero: number; clave: string | null } | null>(null);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const alVolver = (e: PageTransitionEvent) => {
      const enCurso = pagoEnCursoRef.current;
      if (!e.persisted || !enCurso) return;
      setRedirigiendo(false);
      setPedidoHecho((p) => p ?? { numero: enCurso.numero, referencia: null, texto: textoDelPedido(null, "cancelado"), pago: "cancelado", clave: enCurso.clave });
      referenciaDelPedido(enCurso.numero, enCurso.clave).then((referencia) => {
        if (referencia) setPedidoHecho((p) => (p && p.numero === enCurso.numero && !p.referencia ? { ...p, referencia, texto: textoDelPedido(referencia, p.pago ?? null) } : p));
      });
    };
    window.addEventListener("pageshow", alVolver);
    return () => window.removeEventListener("pageshow", alVolver);
  }, []);

  // Pagar con tarjeta un pedido ya guardado (desde la confirmación, tras cancelar en Stripe o si no se pudo abrir).
  const pagarPedidoGuardado = useCallback(async () => {
    if (!pedidoHecho?.numero || redirigiendo) return;
    setAvisoPago(null);
    setRedirigiendo(true);
    pagoEnCursoRef.current = { numero: pedidoHecho.numero, clave: pedidoHecho.clave ?? null };
    const medido = trackEvent("pago_tarjeta", "Pago online", { path: "/checkout", metadata: { numero: pedidoHecho.numero, modo: pagoTarjeta.modo, reintento: true } });
    const r = await irAlPagoConTarjeta(pedidoHecho.numero, pedidoHecho.clave ?? null, medido);
    if (r === "redirigiendo") return;
    setRedirigiendo(false);
    if (r === "pagado") {
      setPedidoHecho((p) => (p ? { ...p, pago: "pagado", texto: textoDelPedido(p.referencia ?? null, "pagado") } : p));
    } else {
      // Al reintentar se dice que ha vuelto a fallar (no el mismo texto del título).
      setAvisoPago(r.aviso === AVISO_SIN_ABRIR ? "Sigue sin abrirse la página de pago. Espera un momento y vuelve a intentarlo, o habla con el equipo." : r.aviso);
    }
  }, [pedidoHecho, redirigiendo, pagoTarjeta.modo]);

  const onPay = useCallback(async (conTarjeta: boolean) => {
    if (enviandoRef.current) return;
    setErr(null);

    if (items.length === 0) {
      setErr("Tu carrito está vacío.");
      return;
    }
    if (!formOk) {
      setErr("Revisa tus datos. Falta algún campo obligatorio para el envío.");
      return;
    }

    // Reserva de 15 minutos: si alguna ya caducó, el artículo puede estar en otra cesta.
    const caducado = items.find((it) => (it.reservedUntil ?? 0) <= Date.now());
    if (caducado) {
      setErr(
        `Se acabó la reserva de "${caducado.title}" (${RESERVA_MINUTOS} minutos). Vuelve a la cesta para revisarla.`
      );
      return;
    }

    enviandoRef.current = true;
    setSubmitting(true);
    try {
      // 1) Se registra el pedido en la tienda (supabase/migrations/20261013120000_pedidos.sql).
      //    El total lo calcula la base de datos con los precios reales. Se manda una clave única de
      //    esta compra: repetir el envío devuelve el mismo pedido (repetido = true) en vez de crear
      //    otro. Si la función nueva aún no existe, se usa la antigua; si falla la red, la pantalla
      //    lo dice y deja volver a intentarlo (la cesta se queda como estaba).
      let numero: number | null = null;
      let repetido = false;
      // La clave de esta compra: con ella (o con la cuenta) el servidor sabe que el pedido es de quien lo paga.
      let claveCompra: string | null = null;
      try {
        const datos = {
          nombre: safeStr(fullName),
          email: safeStr(email),
          telefono: safeStr(phone),
          entrega,
          direccion: entrega === "envio" ? safeStr(address1) : "",
          codigo_postal: entrega === "envio" ? safeStr(postalCode) : "",
          ciudad: entrega === "envio" ? safeStr(city) : "",
          notas: safeStr(notes),
        };
        const ids = items.map((it) => it.id);
        const clave = await claveDelPedido(items);
        claveCompra = clave;
        const r = await supabase.rpc("crear_pedido_idempotente", { p_clave: clave, p_datos: datos, p_productos: ids });
        if (!r.error && r.data && typeof r.data === "object") {
          const res = r.data as { numero?: number | string; repetido?: boolean };
          numero = Number(res.numero) || null;
          repetido = !!res.repetido;
        } else if (r.error && funcionNoDisponible(r.error)) {
          // Respaldo mientras la migración no esté aplicada (o tras una vuelta atrás): la función
          // antigua. Con la migración aplicada ya es idempotente por «misma compra»; sin ella, no.
          const { data, error } = await supabase.rpc("crear_pedido", { p_datos: datos, p_productos: ids });
          if (!error && data != null) numero = Number(data);
        }
        // Con número, esta operación ya está hecha: la próxima compra empieza con clave nueva.
        if (numero) {
          claveEnMemoria = null;
          await AsyncStorage.removeItem(PEDIDO_CLAVE_KEY);
        }
      } catch {
        // sin número: «No hemos podido guardar tu pedido» (la clave queda guardada para el reintento)
      }
      // Si el pedido lleva artículos de VeoAura, el servidor avisa a VeoAura para que no los
      // venda también en la tienda física (api/escaparate-retorno.ts). No se espera. Se despierta
      // también con un pedido repetido: si la primera respuesta se perdió, nadie lo había hecho, y
      // es seguro repetirlo (solo procesa lo que hay en la base de datos y cada aviso sale una sola
      // vez por pedido y artículo, escaparate_salida).
      if (numero && Platform.OS === "web") {
        fetch("/api/escaparate-retorno", { method: "POST" }).catch(() => {});
      }
      // Un reintento (repetido) no vuelve a contar como una venta nueva: el primer intento ya lo
      // contó, aunque se quedara sin número.
      const tarjeta = conTarjeta && pagoTarjeta.disponible && !!numero && Platform.OS === "web";
      let medidoPedido: Promise<unknown> = Promise.resolve();
      if (!repetido) {
        medidoPedido = trackEvent("order_whatsapp", "Pedido por WhatsApp", {
          path: "/checkout",
          metadata: { numero, total, items: items.length, entrega, envio: shipping, zona: envio.zona?.zona ?? null, tarjeta },
        });
        await markBuyNowSoldIfApplies(items);
      }

      // 2) Con el pedido registrado, la cesta se vacía y se muestra la confirmación (con la referencia, sin el número
      //    interno). Si no se pudo guardar, la cesta se queda como estaba para volver a intentarlo.
      if (numero) await saveCart([]);
      // 3) Con tarjeta: a la página de pago de Stripe (con el total que pone el servidor). Si no se puede abrir, el pedido
      //    ya está guardado y la confirmación ofrece volver a intentarlo o hablarlo por el chat.
      if (tarjeta && numero) {
        const medidoPago = trackEvent("pago_tarjeta", "Pago online", { path: "/checkout", metadata: { numero, total, modo: pagoTarjeta.modo } });
        setRedirigiendo(true);
        setItems([]);
        pagoEnCursoRef.current = { numero, clave: claveCompra };
        const r = await irAlPagoConTarjeta(numero, claveCompra, Promise.all([medidoPedido, medidoPago]));
        if (r === "redirigiendo") return;
        const referencia = await referenciaDelPedido(numero, claveCompra);
        setRedirigiendo(false);
        if (r === "pagado") {
          setPedidoHecho({ numero, referencia, texto: textoDelPedido(referencia, "pagado"), pago: "pagado", clave: null });
        } else {
          setAvisoPago(r.aviso);
          setPedidoHecho({ numero, referencia, texto: buildTextoPedido(referencia, true), pago: "sin_abrir", clave: claveCompra });
        }
        return;
      }
      // 4) Pantalla de confirmación: desde ahí se habla con la tienda por el chat.
      const referencia = numero ? await referenciaDelPedido(numero, claveCompra) : null;
      if (numero) setItems([]);
      setPedidoHecho({ numero, referencia, texto: buildTextoPedido(referencia, !!numero), pago: null, clave: claveCompra });
    } catch (e: any) {
      console.error("Error al finalizar el pedido:", e);
      setErr("No se pudo finalizar el pedido. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
      enviandoRef.current = false;
    }
  }, [items, formOk, fullName, email, phone, entrega, address1, postalCode, city, notes, total, shipping, envio.zona, buildTextoPedido, pagoTarjeta]);

  // --- Confirmación y «No se ha hecho el pago» (dueño, 2026-11-11: «intuitiva, práctica y profesional») ---------------
  // Siempre dice qué ha pasado (título), con qué pedido (su referencia VZ-…) y qué no se ha cobrado; UNA sola píldora azul
  // con lo siguiente que hay que hacer y lo demás como texto con su icono. Sin WhatsApp ni teléfono: el chat de la tienda.
  const estadoPago = pedidoHecho?.pago ?? null;
  // Sin número: la base de datos no llegó a guardarlo (sin conexión). La cesta sigue como estaba.
  const sinGuardar = !!pedidoHecho && !pedidoHecho.numero && estadoPago === null;
  const sesionStripe = typeof params.sesion === "string" ? params.sesion : "";
  const conProblema = estadoPago === "cancelado" || estadoPago === "sin_abrir" || estadoPago === "sin_confirmar" || sinGuardar;
  const tituloConfirmacion =
    estadoPago === "comprobando"
      ? "Comprobando tu pago"
      : estadoPago === "pagado"
        ? "¡Gracias por tu compra!"
        : estadoPago === "cancelado"
          ? "No se ha hecho el pago"
          : estadoPago === "sin_abrir"
            ? "No se ha podido abrir el pago"
            : estadoPago === "sin_confirmar"
              ? "Aún no nos consta el pago"
              : sinGuardar
                ? "No hemos podido guardar tu pedido"
                : "¡Gracias por tu pedido!";
  const textoConfirmacion =
    estadoPago === "pagado"
      ? `Pago recibido${pagoTarjeta.modo === "prueba" ? " (pago de prueba: no se ha cobrado nada)" : ""}. Te escribimos por el chat de la tienda para la entrega.`
      : estadoPago === "cancelado" || estadoPago === "sin_abrir"
        ? ofreceReintento
          ? "No te hemos cobrado nada. Tu pedido sigue guardado: vuelve a intentar el pago cuando quieras o, si prefieres otra forma de pago, habla con el equipo."
          : "No te hemos cobrado nada. Tu pedido sigue guardado: habla con el equipo y te ayudamos a terminar el pago."
        : estadoPago === "sin_confirmar"
          ? "Si has terminado el pago, se confirmará solo en unos minutos y no tienes que hacer nada más. Si no llegaste a pagar, vuelve a intentarlo."
          : sinGuardar
            ? "No te hemos cobrado nada y tu cesta sigue igual. Vuelve a intentarlo en un momento; si no se arregla, habla con el equipo."
            : "Te escribimos por el chat de la tienda para confirmar la disponibilidad, el pago y la entrega.";
  // La única píldora: lo siguiente que hay que hacer.
  const principal: "reintentar" | "comprobar" | "volver" | "hablar" | null =
    !pedidoHecho || estadoPago === "comprobando"
      ? null
      : estadoPago === "sin_confirmar" && sesionStripe
        ? "comprobar"
        : ofreceReintento
          ? "reintentar"
          : sinGuardar
            ? "volver"
            : "hablar";
  // El aviso de «no se ha podido abrir» ya lo dice el título de esa pantalla: no se repite.
  const avisoVisible = avisoPago && !(estadoPago === "sin_abrir" && avisoPago === AVISO_SIN_ABRIR) ? avisoPago : null;

  // Cabecera: con el formulario va DENTRO del desplazamiento (se desplaza con todo, como en Servicios); en las demás
  // pantallas (cargando, confirmación, cesta vacía) arriba.
  const enFormulario = !loading && !pedidoHecho && items.length > 0;
  const cabecera = (
    <View
      style={{
        backgroundColor: enFormulario ? "transparent" : COLORS.bg2,
        paddingHorizontal: enFormulario ? 0 : 16,
        paddingTop: enFormulario ? 0 : 14,
        paddingBottom: enFormulario ? 4 : 12,
        gap: 10,
      }}
    >
      <View style={columnStyle}>
        <CabeceraMarca onBack={smartBackToHome} />
        <View style={{ marginTop: 8 }}>
          {/* En la confirmación, el título de la pantalla es el del estado del pedido (más abajo): aquí no se repite. */}
          {pedidoHecho ? null : (
            <>
              <Text accessibilityRole="header" style={{ color: COLORS.text, fontSize: 22, fontWeight: "900", textAlign: "center" }}>
                Finalizar compra
              </Text>
              <Text style={{ color: COLORS.muted, marginTop: 4, textAlign: "center" }}>Rápido, claro y sin costes ocultos.</Text>
            </>
          )}
        </View>

        {/* Con el formulario, el aviso sale junto al botón (donde se ha tocado). */}
        {err && !enFormulario ? (
          <Text style={{ color: "#B91C1C", fontWeight: "800", marginTop: 10, lineHeight: 20, textAlign: "center" }}>{err}</Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {enFormulario ? null : cabecera}

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <CargaMarca texto="Cargando…" />
        </View>
      ) : redirigiendo && !pedidoHecho ? (
        // Pedido guardado y saliendo hacia la página de pago de Stripe.
        <View nativeID="pago-abriendo-stripe" style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 }}>
          <CargaMarca texto="Abriendo el pago seguro de Stripe…" />
        </View>
      ) : pedidoHecho ? (
        // Confirmación y «No se ha hecho el pago»: qué ha pasado, con qué pedido (su referencia) y qué hacer ahora.
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 32 + insets.bottom, alignItems: "center" }}>
          <View nativeID="pago-confirmacion" style={{ ...columnStyle, maxWidth: 460, gap: 12, alignItems: "center" }}>
            {conProblema ? (
              // Si algo no ha ido bien, nada de celebraciones: un icono sereno, sin burbuja.
              <Ionicons name={sinGuardar ? "cloud-offline-outline" : "card-outline"} size={52} color={COLORS.accent} />
            ) : (
              <MarcaAnimada cual="pareja" ancho={220} />
            )}
            <Text nativeID="pago-confirmacion-titulo" accessibilityRole="header" style={{ color: COLORS.text, fontWeight: "900", fontSize: 22, textAlign: "center" }}>
              {tituloConfirmacion}
            </Text>
            {/* La referencia del pedido, como en cualquier empresa (nunca «Pedido nº 2»). Se puede copiar. */}
            {pedidoHecho.referencia ? (
              <Text nativeID="pago-referencia" selectable style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, letterSpacing: 0.5, textAlign: "center" }}>
                Pedido {pedidoHecho.referencia}
              </Text>
            ) : null}
            {estadoPago === "comprobando" ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <ActivityIndicator size="small" color={COLORS.accent} />
                <Text style={{ color: COLORS.muted, lineHeight: 22, textAlign: "center" }}>Lo estamos comprobando con Stripe, un momento…</Text>
              </View>
            ) : (
              <Text
                nativeID="pago-confirmacion-texto"
                style={{ color: estadoPago === "pagado" ? COLORS.success : COLORS.muted, fontWeight: estadoPago === "pagado" ? "800" : "500", lineHeight: 22, textAlign: "center" }}
              >
                {textoConfirmacion}
              </Text>
            )}
            {avisoVisible ? (
              <Text nativeID="pago-aviso" style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20, textAlign: "center" }}>
                {avisoVisible}
              </Text>
            ) : null}

            {/* UNA sola píldora azul: lo siguiente que hay que hacer. */}
            {principal ? (
              <Pressable
                nativeID={
                  principal === "reintentar" ? "pago-reintentar-tarjeta" : principal === "comprobar" ? "pago-comprobar-otra-vez" : principal === "volver" ? "pago-volver-intentar" : "pago-hablar"
                }
                onPress={() => {
                  if (principal === "reintentar") pagarPedidoGuardado();
                  else if (principal === "comprobar") comprobarVuelta(sesionStripe);
                  else if (principal === "volver") {
                    setAvisoPago(null);
                    setPedidoHecho(null);
                  } else hablarConNosotros();
                }}
                disabled={redirigiendo || (principal === "hablar" && abriendoChat)}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  opacity: redirigiendo || (principal === "hablar" && abriendoChat) ? 0.6 : pressed ? 0.88 : 1,
                  alignSelf: "stretch",
                  marginTop: 6,
                  minHeight: 52,
                  paddingHorizontal: 22,
                  borderRadius: 999,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  backgroundColor: COLORS.accentDark,
                })}
              >
                {(principal === "reintentar" && redirigiendo) || (principal === "hablar" && abriendoChat) ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons
                    name={principal === "reintentar" ? "card-outline" : principal === "comprobar" ? "refresh-outline" : principal === "volver" ? "refresh-outline" : "chatbubbles-outline"}
                    size={18}
                    color="#FFFFFF"
                  />
                )}
                <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16, textAlign: "center" }}>
                  {principal === "reintentar"
                    ? "Volver a intentar el pago"
                    : principal === "comprobar"
                      ? "Comprobar otra vez"
                      : principal === "volver"
                        ? "Volver a intentarlo"
                        : "Hablar con el equipo"}
                </Text>
              </Pressable>
            ) : null}

            {/* Lo demás, como texto con su icono (sin burbuja), de 44 px. */}
            <View style={{ alignItems: "center", gap: 2, marginTop: 2 }}>
              {ofreceReintento && principal !== "reintentar" ? (
                <AccionTexto nativeID="pago-reintentar-tarjeta" icono="card-outline" texto="Volver a intentar el pago" onPress={pagarPedidoGuardado} cargando={redirigiendo} />
              ) : null}
              {principal !== "hablar" ? (
                <AccionTexto nativeID="pago-hablar" icono="chatbubbles-outline" texto="Hablar con el equipo" onPress={hablarConNosotros} cargando={abriendoChat} />
              ) : null}
              {sinGuardar ? (
                <AccionTexto nativeID="pago-volver-cesta" icono="arrow-back" texto="Volver a la cesta" onPress={() => router.push("/cesta")} />
              ) : estadoPago !== "comprobando" ? (
                <AccionTexto nativeID="pago-seguir-comprando" icono="bag-handle-outline" texto="Seguir comprando" onPress={() => router.replace("/catalogo")} />
              ) : null}
            </View>
          </View>
        </ScrollView>
      ) : items.length === 0 ? (
        <View style={{ padding: 16, gap: 12, alignItems: "center" }}>
          <View
            style={{
              ...columnStyle,
              paddingVertical: 16,
              gap: 10,
              alignItems: "center",
            }}
          >
            <MarcaAnimada cual="tienda" ancho={120} />
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
              Tu carrito está vacío.
            </Text>
            <Text style={{ color: COLORS.muted, textAlign: "center" }}>
              Para comprar, primero añade algún producto desde el catálogo.
            </Text>

            <Pressable
              onPress={() => router.push("/catalogo")}
              accessibilityRole="button"
              style={({ pressed }) => ({
                marginTop: 6,
                minHeight: 50,
                borderRadius: 999,
                paddingHorizontal: 22,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: COLORS.accentDark,
                alignSelf: "center",
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>Ir al catálogo</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          {/* Todo en el mismo desplazamiento, como cualquier otra página de la tienda: cabecera, resumen, entrega y el
              botón al final. El primer toque fuera del teclado ya pulsa; en la web el teclado no se cierra al
              desplazar (la propia web desplaza hasta el campo que se toca). */}
          <ScrollView
            nativeID="pago-desplazamiento"
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 32 + insets.bottom, alignItems: "center" }}
          >
            <View style={{ ...columnStyle, gap: 14 }}>
            {cabecera}
            {/* Resumen pedido: cada artículo con su miniatura (foto entera sobre blanco, tamaño pequeño). */}
            <View nativeID="pago-resumen" style={{ gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#E3EAF2" }}>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>Resumen</Text>

              {items.map((it) => (
                <View key={it.id} nativeID={`pago-articulo-${it.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 }}>
                  <View nativeID={`pago-foto-${it.id}`} style={{ width: 72, height: 72, borderRadius: 14, overflow: "hidden", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
                    {it.imageUrl ? (
                      <SmartImage uri={it.imageUrl} alt={it.title} ancho={72} contentFit="contain" style={{ width: "100%", height: "100%" }} />
                    ) : (
                      <Ionicons name="image-outline" size={28} color={COLORS.muted} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15 }}>{it.title}</Text>
                    {it.subtitle ? <Text style={{ color: COLORS.muted, fontSize: 13 }}>{it.subtitle}</Text> : null}
                    <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 15 }}>{fmtEUR(it.priceEUR * it.qty)}</Text>
                  </View>
                </View>
              ))}

              <View style={{ height: 1, alignSelf: "stretch", backgroundColor: "#E3EAF2" }} />
              <Row label="Subtotal" value={fmtEUR(subtotal)} />
              <Row
                nativeID="pago-envio"
                label={entrega === "recogida" ? "Entrega en mano" : envio.zona ? `Envío (${envio.zona.nombre.split(" (")[0]})` : "Envío"}
                value={faltaCodigo ? "Escribe tu código postal" : shipping === 0 ? "Gratis" : fmtEUR(shipping)}
                tono={faltaCodigo ? "suave" : shipping === 0 ? "gratis" : undefined}
              />
              {envio.gratisPorImporte ? (
                <Text style={{ color: COLORS.success, fontWeight: "800", fontSize: 12.5, textAlign: "center" }}>
                  Envío gratis por el importe de tu pedido
                </Text>
              ) : !faltaCodigo && entrega === "envio" && envio.zona?.tramos && shipping > 0 ? (
                // Correos cobra por kilos: se dice el peso con el que se ha calculado.
                <Text nativeID="pago-envio-peso" style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "center" }}>
                  Con Correos, según el peso del pedido: {fmtKg(pesoKg)} con embalaje
                </Text>
              ) : null}
              <Row nativeID="pago-total" label="Total" value={fmtEUR(total)} strong />
            </View>

            {/* Datos envío */}
            <View style={{ gap: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#E3EAF2" }}>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>Entrega</Text>

              {/* Envío a domicilio o entrega en mano: dos opciones con su icono y su marca de elegida, sin burbujas. */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 18 }}>
                {(
                  [
                    { key: "envio", label: "Envío a domicilio", icon: "cube-outline" },
                    { key: "recogida", label: "Entrega en mano", icon: "hand-left-outline" },
                  ] as const
                ).map((op) => {
                  const activa = entrega === op.key;
                  return (
                    <Pressable
                      key={op.key}
                      nativeID={`pago-entrega-${op.key}`}
                      onPress={() => setEntrega(op.key)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: activa }}
                      accessibilityLabel={op.label}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.6 : 1,
                        minHeight: 48,
                        paddingHorizontal: 4,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      })}
                    >
                      <Ionicons name={activa ? "radio-button-on" : "radio-button-off"} size={20} color={activa ? COLORS.accent : COLORS.muted} />
                      <Ionicons name={op.icon} size={18} color={activa ? COLORS.accent : COLORS.muted} />
                      <Text style={{ color: activa ? COLORS.text : COLORS.muted, fontWeight: "900", fontSize: 14.5, textAlign: "center" }}>
                        {op.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
                {entrega === "recogida"
                  ? "Te lo entregamos en mano en Cuarte de Huerva. Te avisamos por el chat de la tienda cuando esté listo."
                  : "En Zaragoza te lo llevamos el mismo día. Al resto de España sale en 1-2 días y llega en 72 horas como máximo."}
              </Text>
              {!envio.disponible ? (
                <View nativeID="pago-zona-sin-envio" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Ionicons name="alert-circle-outline" size={18} color={COLORS.danger} />
                  <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20, textAlign: "center", flexShrink: 1 }}>
                    A {envio.zona?.nombre ?? "esta zona"} no enviamos desde la web: escríbenos por el chat de la tienda y te decimos cómo hacerlo.
                  </Text>
                </View>
              ) : null}
              {/* Televisores sin su caja original: no se envían (dueño, 2026-11-07). */}
              {bloqueoSoloMano ? (
                <View nativeID="pago-solo-mano" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Ionicons name="alert-circle-outline" size={18} color={COLORS.danger} />
                  <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20, textAlign: "center", flexShrink: 1 }}>
                    {articulosSoloMano.length === 1 ? `«${articulosSoloMano[0].title}» no se puede enviar` : "Algunos artículos no se pueden enviar"} sin su caja
                    original: elige «Entrega en mano» o escríbenos por el chat de la tienda.
                  </Text>
                </View>
              ) : null}

              <Field label="Nombre y apellidos" value={fullName} onChangeText={setFullName} placeholder="Nombre completo" />
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="tu@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Field
                label="Teléfono"
                value={phone}
                onChangeText={setPhone}
                // Un ejemplo, no el móvil de la tienda (no se atiende por teléfono): así nadie lo confunde con un número al que llamar.
                placeholder="600 000 000"
                keyboardType="phone-pad"
              />
              {entrega === "envio" ? (
                <>
                  {desdePerfil ? (
                    <View nativeID="pago-direccion-perfil" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <Ionicons name="location-outline" size={16} color={COLORS.accent} />
                      <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5, textAlign: "center", flexShrink: 1 }}>
                        Con la dirección de tu perfil (puedes cambiarla aquí)
                      </Text>
                    </View>
                  ) : null}
                  <Field
                    label="Dirección"
                    value={address1}
                    onChangeText={setAddress1}
                    placeholder="Calle, número, piso..."
                  />

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Código postal"
                        value={postalCode}
                        onChangeText={setPostalCode}
                        placeholder="50001"
                        keyboardType="number-pad"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field label="Ciudad" value={city} onChangeText={setCity} placeholder="Zaragoza" />
                    </View>
                  </View>
                </>
              ) : null}

              <Field
                label="Notas (opcional)"
                value={notes}
                onChangeText={setNotes}
                placeholder="Ej.: por la tarde, portal B..."
                multiline
              />

              {/* Micro trust */}
              <View style={{ gap: 6, alignItems: "center", paddingTop: 6 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
                  {(
                    [
                      { icon: "checkmark-circle-outline", label: "Productos revisados" },
                      { icon: "cube-outline", label: "Envío a España" },
                      { icon: "receipt-outline", label: "Recibo" },
                      { icon: "chatbubbles-outline", label: "Atención por chat" },
                    ] as const
                  ).map((item) => (
                    <View
                      key={item.label}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                    >
                      <Ionicons name={item.icon} size={14} color={COLORS.muted} />
                      <Text style={{ color: COLORS.muted, lineHeight: 20 }}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Una sola acción principal, clara y con el total a la vista, al final del formulario (dentro del
                desplazamiento: nunca tapa los campos ni se queda bajo el teclado). */}
            <View nativeID="pago-confirmar" style={{ gap: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#E3EAF2" }}>
              {err ? (
                <Text nativeID="pago-error" style={{ color: "#B91C1C", fontWeight: "800", lineHeight: 20, textAlign: "center" }}>
                  {err}
                </Text>
              ) : null}
              <View style={{ ...columnStyle, maxWidth: 460 }}>
                <Pressable
                  nativeID={pagoTarjeta.disponible ? "pago-tarjeta" : "pago-confirmar-boton"}
                  disabled={!formOk || submitting || redirigiendo}
                  onPress={() => onPay(pagoTarjeta.disponible)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    opacity: !formOk || submitting || redirigiendo ? 0.45 : pressed ? 0.9 : 1,
                    borderRadius: 999,
                    minHeight: 54,
                    paddingVertical: 10,
                    paddingHorizontal: 18,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    backgroundColor: COLORS.accentDark,
                  })}
                >
                  {submitting || redirigiendo ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name={pagoTarjeta.disponible ? "card-outline" : "lock-closed-outline"} size={18} color="#FFFFFF" />
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16, textAlign: "center" }}>
                        {pagoTarjeta.disponible ? "Pagar" : "Confirmar pedido"} · {fmtEUR(total)}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>

              {/* Cómo se paga en la página de Stripe: tarjeta (con Apple Pay) y, si se ofrecen, Bizum (2026-11-11) y Klarna a plazos (2026-11-06). */}
              {pagoTarjeta.disponible ? (
                <Text nativeID="pago-metodos" style={{ color: "rgba(11,33,56,0.55)", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
                  {textoMetodosPago(pagoTarjeta)}
                </Text>
              ) : null}
              {/* Con pago con tarjeta, confirmar sin pagar sigue como siempre (el pago se habla por el chat). Solo texto. */}
              {pagoTarjeta.disponible ? (
                <Pressable
                  nativeID="pago-sin-tarjeta"
                  disabled={!formOk || submitting || redirigiendo}
                  onPress={() => onPay(false)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    alignSelf: "center",
                    minHeight: 44,
                    paddingHorizontal: 8,
                    justifyContent: "center",
                    opacity: !formOk || submitting || redirigiendo ? 0.45 : pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ color: COLORS.accent, fontWeight: "800", fontSize: 14, textAlign: "center" }}>Confirmar sin pagar ahora</Text>
                </Pressable>
              ) : null}
              {pagoTarjeta.disponible ? (
                <Text nativeID="pago-sin-tarjeta-ayuda" style={{ color: "rgba(11,33,56,0.55)", fontSize: 12.5, lineHeight: 18, textAlign: "center", marginTop: -6 }}>
                  Sin pagar ahora, te escribimos por el chat de la tienda para acordar el pago.
                </Text>
              ) : null}
              {pagoTarjeta.modo === "prueba" ? (
                <Text nativeID="pago-modo-prueba" style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
                  Modo de prueba de Stripe (solo lo ve el administrador): no se cobra nada. Tarjeta de prueba 4242 4242 4242 4242,
                  cualquier fecha futura y cualquier CVC.
                </Text>
              ) : null}

              {/* Con el pago disponible y todo rellenado, ya lo explican «pago-metodos» y «Confirmar sin pagar ahora»: no se repite. */}
              {formOk && pagoTarjeta.disponible ? null : (
              <Text style={{ color: "rgba(11,33,56,0.55)", textAlign: "center", fontSize: 12.5, lineHeight: 18 }}>
                {formOk
                  ? "Te confirmamos pago y entrega por el chat de la tienda."
                  : bloqueoSoloMano
                    ? "Elige «Entrega en mano» para este pedido."
                    : !envio.disponible
                    ? "Escríbenos por el chat para envíos a esta zona."
                    : faltaCodigo
                      ? "Escribe tu código postal para calcular el envío."
                      : entrega === "recogida"
                        ? "Completa nombre, email y teléfono para confirmar el pedido."
                        : "Completa los datos de envío para confirmar el pedido."}
              </Text>
              )}

              {/* Lo legal, a mano y sin letra pequeña escondida: qué se acepta al confirmar, con sus dos páginas (44 px). */}
              <View nativeID="pago-legal" style={{ alignItems: "center" }}>
                <Text style={{ color: "rgba(11,33,56,0.55)", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
                  Al confirmar el pedido aceptas las condiciones de la tienda y su política de privacidad.
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 14 }}>
                  {(
                    [
                      { id: "pago-legal-terminos", icono: "document-text-outline", texto: "Condiciones", ruta: "/politicas/terminos" },
                      { id: "pago-legal-privacidad", icono: "shield-checkmark-outline", texto: "Privacidad", ruta: "/politicas/privacidad" },
                    ] as const
                  ).map((l) => (
                    <Pressable
                      key={l.id}
                      nativeID={l.id}
                      onPress={() => router.push(l.ruta as never)}
                      accessibilityRole="link"
                      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", gap: 5, opacity: pressed ? 0.6 : 1 })}
                    >
                      <Ionicons name={l.icono} size={15} color={COLORS.accent} />
                      <Text style={{ color: COLORS.accent, fontWeight: "800", fontSize: 13 }}>{l.texto}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Volver: solo el texto con su icono, sin burbuja. */}
              <Pressable
                nativeID="pago-volver-cesta"
                onPress={() => router.push("/cesta")}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  alignSelf: "center",
                  minHeight: 44,
                  paddingHorizontal: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Ionicons name="arrow-back" size={18} color={COLORS.accent} />
                <Text style={{ color: COLORS.accent, fontWeight: "800", fontSize: 14 }}>Volver a la cesta</Text>
              </Pressable>
            </View>
            </View>
          </ScrollView>
        </>
      )}
    </View>
  );
}

// Acción secundaria: solo su icono y su texto en azul (sin burbuja), de 44 px para el dedo.
function AccionTexto({ nativeID, icono, texto, onPress, cargando }: { nativeID: string; icono: React.ComponentProps<typeof Ionicons>["name"]; texto: string; onPress: () => void; cargando?: boolean }) {
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      disabled={cargando}
      accessibilityRole="button"
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, opacity: cargando ? 0.6 : pressed ? 0.6 : 1 })}
    >
      {cargando ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Ionicons name={icono} size={18} color={COLORS.accent} />}
      <Text style={{ color: COLORS.accent, fontWeight: "800", fontSize: 15, textAlign: "center" }}>{texto}</Text>
    </Pressable>
  );
}

function Row({
  label,
  value,
  strong,
  tono,
  nativeID,
}: {
  label: string;
  value: string;
  strong?: boolean;
  /** «gratis»: en verde; «suave»: en gris (un aviso, no un importe). Solo texto, sin burbuja. */
  tono?: "gratis" | "suave";
  nativeID?: string;
}) {
  return (
    <View nativeID={nativeID} style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 8 }}>
      <Text style={{ color: "rgba(11,33,56,0.62)", fontWeight: strong ? "900" : "700" }}>
        {label}:
      </Text>
      <Text
        style={{
          color: tono === "gratis" ? COLORS.success : tono === "suave" ? COLORS.muted : "#0B2138",
          fontWeight: tono === "suave" ? "700" : strong ? "900" : "800",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  autoCapitalize?: any;
  multiline?: boolean;
}) {
  const { label, value, onChangeText, placeholder, keyboardType, autoCapitalize, multiline } = props;

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: "rgba(11,33,56,0.70)", fontWeight: "800", textAlign: "center" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(11,33,56,0.35)"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        style={{
          width: "100%",
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#E3EAF2",
          backgroundColor: "#F6FAFD",
          paddingVertical: Platform.select({ web: 12, default: 12 }),
          paddingHorizontal: 12,
          color: "#0B2138",
          // 16 px: con menos, el iPhone amplía la página al tocar el campo y se descoloca el desplazamiento.
          fontSize: 16,
          fontWeight: "800",
          minHeight: multiline ? 90 : undefined,
          textAlignVertical: multiline ? "top" : "auto",
        }}
      />
    </View>
  );
}
