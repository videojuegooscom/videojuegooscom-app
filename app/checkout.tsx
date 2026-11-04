/**
 * app/checkout.tsx
 *
 * Qué hace: pantalla de checkout (finalizar compra). Lee el carrito guardado
 * en AsyncStorage, pide los datos de envío (nombre, email, teléfono,
 * dirección) y, al confirmar, registra el pedido y muestra la confirmación
 * (todavía no hay pasarela de pago tipo Stripe conectada).
 *
 * Cómo funciona: guarda el carrito en local con la misma clave que usa
 * cesta.tsx (CART_KEY = "videojuegoos_cart_v1"), valida el formulario campo
 * a campo (formOk) y construye el texto del pedido (buildWhatsText). En la
 * confirmación, "Hablar con nosotros" lo manda al chat de la tienda
 * (abrirChatEquipo); sin sesión lleva a Blue IA con ?pedido=. WhatsApp queda
 * solo como enlace secundario ("¿Prefieres WhatsApp?").
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
  Linking,
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CargaMarca from "../components/marca/CargaMarca";
import CabeceraMarca from "../components/CabeceraMarca";
import MarcaAnimada from "../components/marca/MarcaAnimada";
import SmartImage from "../components/SmartImage";
import { abrirChatEquipo } from "../components/ProductChatThread";
import { calcularEnvio, cargarTarifas, hayEnviosDePago, limpiarCodigoPostal, type ZonaEnvio } from "../lib/envio";
import { supabase } from "../lib/supabase";
import { openExternalLink } from "../lib/openExternalLink";
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
// bloquea ni avisa si falla: es un extra sobre el pedido por WhatsApp, que
// es lo que de verdad cierra la venta.
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

const BRAND = {
  whatsappPhoneE164: "+34627748741",
};

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

function openWhatsApp(prefill: string) {
  const phone = BRAND.whatsappPhoneE164.replace(/[^\d+]/g, "");
  const text = encodeURIComponent((prefill ?? "").trim().slice(0, 900));
  const url = `https://wa.me/${phone.replace("+", "")}?text=${text}`;
  try {
    openExternalLink(url);
  } catch {
    Linking.openURL(`https://api.whatsapp.com/send?phone=${phone.replace("+", "")}&text=${text}`);
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
  // Número del pedido ya registrado (pantalla de confirmación).
  const [pedidoHecho, setPedidoHecho] = useState<{ numero: number | null; texto: string } | null>(null);

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
  const envio = useMemo(
    () => calcularEnvio(tarifas, { entrega, codigoPostal: postalCode, productos: subtotal }),
    [tarifas, entrega, postalCode, subtotal]
  );
  // A domicilio y con envíos de pago: hasta tener un código postal de 5 cifras, el envío aún no se sabe.
  const faltaCodigo = entrega === "envio" && hayEnviosDePago(tarifas) && limpiarCodigoPostal(postalCode).length !== 5;
  const shipping = faltaCodigo ? 0 : envio.precio;
  const total = subtotal + shipping;

  const formOk = useMemo(() => {
    if (items.length === 0) return false;
    // La tienda no envía a esa zona desde la web: se pide escribir antes (ver el aviso de la entrega). Con envíos de
    // pago, sin un código postal completo no se sabe el envío (ni el total).
    if (!envio.disponible || faltaCodigo) return false;

    const nameOk = safeStr(fullName).length >= 2;
    const emailOk = isValidEmail(email);
    const phoneOk = isValidPhone(phone);

    if (entrega === "recogida") return nameOk && emailOk && phoneOk;

    const addrOk = safeStr(address1).length >= 6;
    const cpOk = safeStr(postalCode).length >= 4;
    const cityOk = safeStr(city).length >= 2;

    return nameOk && emailOk && phoneOk && addrOk && cpOk && cityOk;
  }, [items.length, fullName, email, phone, address1, postalCode, city, entrega, envio.disponible, faltaCodigo]);

  const buildWhatsText = useCallback((numero: number | null) => {
    const lines: string[] = [];
    lines.push(
      numero
        ? `¡Hola! Acabo de hacer el pedido nº ${numero} en Videojuegoszaragoza.com 👇`
        : "¡Hola! Quiero hacer un pedido desde Videojuegoszaragoza.com 👇"
    );
    lines.push("");
    lines.push(entrega === "recogida" ? "🤝 Entrega: en mano en Cuarte de Huerva" : "🚚 Entrega: envío a domicilio");
    lines.push("");
    if (items.length > 0) {
      lines.push("🛒 Pedido:");
      for (const it of items) {
        lines.push(`- ${it.title} x${it.qty} (${fmtEUR(it.priceEUR * it.qty)})`);
      }
      lines.push(`Envío: ${shipping === 0 ? "gratis" : fmtEUR(shipping)}`);
      lines.push(`Total: ${fmtEUR(total)}`);
      lines.push("");
    }
    lines.push("📦 Datos:");
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
        ? "¿Me confirmas disponibilidad, forma de pago y cuándo puedo pasar a recogerlo?"
        : "¿Me confirmas disponibilidad y forma de pago/envío?"
    );
    return lines.join("\n");
  }, [items, total, shipping, fullName, email, phone, address1, postalCode, city, notes, entrega]);

  // Abre el chat de la tienda con el pedido; sin sesión, Blue IA con el pedido como contexto.
  const [abriendoChat, setAbriendoChat] = useState(false);
  const hablarConNosotros = useCallback(async () => {
    if (!pedidoHecho || abriendoChat) return;
    setAbriendoChat(true);
    try {
      const r = await abrirChatEquipo({ resumen: pedidoHecho.texto });
      if (r === "login") {
        router.push(
          (pedidoHecho.numero
            ? `/blue-ia?pedido=${pedidoHecho.numero}`
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

  const onPay = useCallback(async () => {
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
      //    otro. Si la función nueva aún no existe o falla la red, el pedido sigue por WhatsApp
      //    como hasta ahora.
      let numero: number | null = null;
      let repetido = false;
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
        // sin número: se sigue por WhatsApp (la clave queda guardada para el reintento)
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
      if (!repetido) {
        trackEvent("order_whatsapp", "Pedido por WhatsApp", {
          path: "/checkout",
          metadata: { numero, total, items: items.length, entrega, envio: shipping, zona: envio.zona?.zona ?? null },
        });
        await markBuyNowSoldIfApplies(items);
      }

      // 2) Con el pedido registrado, la cesta se vacía y se muestra la confirmación.
      const texto = buildWhatsText(numero);
      if (numero) {
        await saveCart([]);
        setItems([]);
      }
      // 3) Pantalla de confirmación: desde ahí se habla con la tienda por el chat.
      setPedidoHecho({ numero, texto });
    } catch (e: any) {
      console.error("Error al finalizar el pedido:", e);
      setErr("No se pudo finalizar el pedido. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
      enviandoRef.current = false;
    }
  }, [items, formOk, fullName, email, phone, entrega, address1, postalCode, city, notes, total, shipping, envio.zona, buildWhatsText]);

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
          <Text accessibilityRole="header" style={{ color: COLORS.text, fontSize: 22, fontWeight: "900", textAlign: "center" }}>
            Finalizar compra
          </Text>
          <Text style={{ color: COLORS.muted, marginTop: 4, textAlign: "center" }}>Rápido, claro y sin costes ocultos.</Text>
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
      ) : pedidoHecho ? (
        // Confirmación: el pedido ya está registrado (sin número, se completa por el chat).
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24, alignItems: "center" }}>
          <View style={{ ...columnStyle, gap: 12, alignItems: "center" }}>
            <MarcaAnimada cual="pareja" ancho={240} />
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 22, textAlign: "center" }}>
              {pedidoHecho.numero ? `Pedido nº ${pedidoHecho.numero} recibido` : "Pedido enviado"}
            </Text>
            <Text style={{ color: COLORS.muted, lineHeight: 22, textAlign: "center" }}>
              {pedidoHecho.numero
                ? "Te escribimos por el chat de la tienda para confirmar la disponibilidad, el pago y la entrega."
                : "Escríbenos por el chat de la tienda y te confirmamos la disponibilidad, el pago y la entrega."}
            </Text>
            <Pressable
              onPress={hablarConNosotros}
              disabled={abriendoChat}
              accessibilityRole="button"
              style={({ pressed }) => ({
                opacity: abriendoChat ? 0.6 : pressed ? 0.88 : 1,
                marginTop: 6,
                minHeight: 50,
                paddingHorizontal: 22,
                borderRadius: 999,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: COLORS.accentDark,
              })}
            >
              {abriendoChat ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="chatbubbles-outline" size={18} color="#FFFFFF" />
              )}
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>Hablar con nosotros</Text>
            </Pressable>
            {/* WhatsApp solo como alternativa discreta. */}
            <Pressable onPress={() => openWhatsApp(pedidoHecho.texto)} hitSlop={6} style={{ paddingVertical: 2 }}>
              <Text style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "center", textDecorationLine: "underline" }}>
                ¿Prefieres WhatsApp?
              </Text>
            </Pressable>
            <Pressable onPress={() => router.replace("/catalogo")} style={{ paddingVertical: 10 }}>
              <Text style={{ color: COLORS.accent, fontWeight: "800", textAlign: "center" }}>Seguir viendo productos</Text>
            </Pressable>
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
                placeholder="627 748 741"
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
                placeholder="Entregar por la tarde, no llamar al timbre..."
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
                      { icon: "headset-outline", label: "Soporte" },
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
                  disabled={!formOk || submitting}
                  onPress={onPay}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    opacity: !formOk || submitting ? 0.45 : pressed ? 0.9 : 1,
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
                  {submitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="lock-closed-outline" size={18} color="#FFFFFF" />
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16, textAlign: "center" }}>
                        Confirmar pedido · {fmtEUR(total)}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>

              <Text style={{ color: "rgba(11,33,56,0.55)", textAlign: "center", fontSize: 12.5, lineHeight: 18 }}>
                {formOk
                  ? "Te confirmamos pago y entrega por el chat de la tienda. Sin pagos por adelantado en la web."
                  : !envio.disponible
                    ? "Escríbenos por el chat para envíos a esta zona."
                    : faltaCodigo
                      ? "Escribe tu código postal para calcular el envío."
                      : entrega === "recogida"
                        ? "Completa nombre, email y teléfono para confirmar el pedido."
                        : "Completa los datos de envío para confirmar el pedido."}
              </Text>

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
