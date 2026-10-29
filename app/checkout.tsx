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
import CargaMarca from "../components/marca/CargaMarca";
import CabeceraMarca from "../components/CabeceraMarca";
import MarcaAnimada from "../components/marca/MarcaAnimada";
import { abrirChatEquipo } from "../components/ProductChatThread";
import { supabase } from "../lib/supabase";
import { openExternalLink } from "../lib/openExternalLink";
import { RESERVA_MINUTOS, reservarProducto } from "../lib/reservas";
import { trackEvent } from "../lib/analytics";

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
  gold: "#B8860B",
  danger: "#DC2626",
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

  const shipping = 0; // MVP: gratis
  const total = subtotal + shipping;

  const formOk = useMemo(() => {
    if (items.length === 0) return false;

    const nameOk = safeStr(fullName).length >= 2;
    const emailOk = isValidEmail(email);
    const phoneOk = isValidPhone(phone);

    if (entrega === "recogida") return nameOk && emailOk && phoneOk;

    const addrOk = safeStr(address1).length >= 6;
    const cpOk = safeStr(postalCode).length >= 4;
    const cityOk = safeStr(city).length >= 2;

    return nameOk && emailOk && phoneOk && addrOk && cpOk && cityOk;
  }, [items.length, fullName, email, phone, address1, postalCode, city, entrega]);

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
  }, [items, total, fullName, email, phone, address1, postalCode, city, notes, entrega]);

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
          metadata: { numero, total, items: items.length, entrega },
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
  }, [items, formOk, fullName, email, phone, entrega, address1, postalCode, city, notes, total, buildWhatsText]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "#F6FAFD",
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <View style={columnStyle}>
          <CabeceraMarca onBack={smartBackToHome} />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              marginTop: 8,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900", textAlign: "center" }}>
                Finalizar compra
              </Text>
              <Text style={{ color: COLORS.muted, marginTop: 4, textAlign: "center" }}>
                Rápido, claro y sin costes ocultos.
              </Text>
            </View>
          </View>

          {err ? (
            <Text style={{ color: "#B91C1C", fontWeight: "800", marginTop: 10, lineHeight: 20, textAlign: "center" }}>
              {err}
            </Text>
          ) : null}
        </View>
      </View>

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
              style={{
                marginTop: 6,
                borderRadius: 999,
                paddingVertical: 12,
                paddingHorizontal: 14,
                backgroundColor: "#EAF6FD",
                borderWidth: 1,
                borderColor: "#BEE6FA",
                alignSelf: "center",
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Ir al catálogo</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          {/* Formulario: el primer toque fuera del teclado ya pulsa y al arrastrar se cierra. */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ padding: 16, paddingBottom: 140, alignItems: "center" }}
          >
            <View style={{ ...columnStyle, gap: 12 }}>
            {/* Resumen pedido */}
            <View style={{ gap: 10, alignItems: "center" }}>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>Resumen</Text>

              {items.map((it) => (
                <View key={it.id} style={{ gap: 4, alignItems: "center", paddingVertical: 6 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }} numberOfLines={2}>
                    {it.title}
                  </Text>
                  {it.subtitle ? (
                    <Text style={{ color: COLORS.muted, textAlign: "center" }}>{it.subtitle}</Text>
                  ) : null}
                  <Text style={{ color: COLORS.gold, fontWeight: "900", textAlign: "center" }}>
                    {fmtEUR(it.priceEUR * it.qty)}
                  </Text>
                </View>
              ))}

              <View style={{ height: 1, alignSelf: "stretch", backgroundColor: "#E3EAF2" }} />
              <Row label="Subtotal" value={fmtEUR(subtotal)} />
              <Row
                label={entrega === "recogida" ? "Entrega" : "Envío"}
                value={entrega === "recogida" ? "En mano" : shipping === 0 ? "Gratis" : fmtEUR(shipping)}
              />
              <Row label="Total" value={fmtEUR(total)} strong />
            </View>

            {/* Datos envío */}
            <View style={{ gap: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#E3EAF2" }}>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>Entrega</Text>

              {/* Envío a domicilio o entrega en mano: dos opciones claras, una pulsada. */}
              <View style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
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
                      onPress={() => setEntrega(op.key)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: activa }}
                      style={({ pressed }) => ({
                        flex: 1,
                        maxWidth: 220,
                        opacity: pressed ? 0.88 : 1,
                        minHeight: 48,
                        paddingHorizontal: 10,
                        borderRadius: 999,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        borderWidth: 1.5,
                        borderColor: activa ? COLORS.accent : COLORS.border,
                        backgroundColor: activa ? COLORS.accent2 : "#FFFFFF",
                      })}
                    >
                      <Ionicons name={op.icon} size={16} color={activa ? COLORS.accentDark : COLORS.muted} />
                      <Text
                        style={{
                          color: activa ? COLORS.accentDark : COLORS.text,
                          fontWeight: "900",
                          fontSize: 13.5,
                          textAlign: "center",
                        }}
                      >
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

            {/* Acciones secundarias */}
            <View style={{ alignItems: "center", gap: 10 }}>
              <Pressable
                onPress={() => router.push("/cesta")}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.88 : 1,
                  borderRadius: 999,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderWidth: 1,
                  borderColor: "#E3EAF2",
                  backgroundColor: "#F6FAFD",
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Volver al carrito</Text>
              </Pressable>

            </View>
            </View>
          </ScrollView>

          {/* Bottom CTA */}
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: 14,
              backgroundColor: "#FFFFFF",
              borderTopWidth: 1,
              borderTopColor: "#E3EAF2",
              shadowColor: "#0B2138",
              shadowOpacity: 0.08,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: -4 },
              elevation: 12,
            }}
          >
            {/* Una sola acción principal, clara y con el total a la vista. */}
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
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: COLORS.accentDark,
                })}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16, textAlign: "center" }}>
                    Confirmar pedido · {fmtEUR(total)}
                  </Text>
                )}
              </Pressable>
            </View>

            <Text style={{ color: "rgba(11,33,56,0.55)", marginTop: 10, textAlign: "center", fontSize: 12.5 }}>
              {formOk
                ? "Te confirmamos pago y entrega por el chat de la tienda. Sin pagos por adelantado en la web."
                : entrega === "recogida"
                  ? "Completa nombre, email y teléfono para confirmar el pedido."
                  : "Completa los datos de envío para confirmar el pedido."}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 }}>
      <Text style={{ color: "rgba(11,33,56,0.62)", fontWeight: strong ? "900" : "700" }}>
        {label}:
      </Text>
      <Text style={{ color: "#0B2138", fontWeight: strong ? "900" : "800" }}>{value}</Text>
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
          fontWeight: "800",
          minHeight: multiline ? 90 : undefined,
          textAlignVertical: multiline ? "top" : "auto",
        }}
      />
    </View>
  );
}
