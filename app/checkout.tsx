/**
 * app/checkout.tsx
 *
 * Qué hace: pantalla de checkout (finalizar compra). Lee el carrito guardado
 * en AsyncStorage, pide los datos de envío (nombre, email, teléfono,
 * dirección) y, al confirmar, arma un mensaje con el pedido y lo abre en
 * WhatsApp (todavía no hay pasarela de pago tipo Stripe conectada).
 *
 * Cómo funciona: guarda el carrito en local con la misma clave que usa
 * cesta.tsx (CART_KEY = "videojuegoos_cart_v1"), valida el formulario campo
 * a campo (formOk), y construye el texto del pedido (whatsText) para
 * enviarlo por WhatsApp con openWhatsApp().
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
import MarcaAnimada from "../components/marca/MarcaAnimada";
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
  accentDark: "#0E86C4",
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

const BRAND = {
  whatsappPhoneE164: "+34627748741",
};

function fmtEUR(n: number) {
  const safe = Number.isFinite(n) ? n : 0;
  // Antes se redondeaba siempre a euros enteros (Math.round) y se perdían
  // los céntimos (17,97€ se veía como "18€"); ahora se muestran decimales
  // solo cuando el precio los tiene de verdad.
  const rounded = Math.round(safe * 100) / 100;
  const hasCents = Math.abs(rounded - Math.round(rounded)) > 0.001;
  return hasCents ? `${rounded.toFixed(2).replace(".", ",")}€` : `${Math.round(rounded)}€`;
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
  // Envío a casa o recogida en tienda (Zaragoza): con recogida no se pide dirección.
  const [entrega, setEntrega] = useState<"envio" | "recogida">("envio");
  // Número del pedido ya registrado (pantalla de confirmación).
  const [pedidoHecho, setPedidoHecho] = useState<{ numero: number | null; texto: string } | null>(null);

  const bootedRef = useRef(false);

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
    lines.push(entrega === "recogida" ? "🏪 Entrega: recogida en tienda" : "🚚 Entrega: envío a domicilio");
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

  const whatsText = useMemo(() => buildWhatsText(null), [buildWhatsText]);

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

    setSubmitting(true);
    try {
      // 1) Se registra el pedido en la tienda (supabase/migrations/20261013120000_pedidos.sql).
      //    El total lo calcula la base de datos con los precios reales. Si la función aún
      //    no existe o falla la red, el pedido sigue por WhatsApp como hasta ahora.
      let numero: number | null = null;
      try {
        const { data, error } = await supabase.rpc("crear_pedido", {
          p_datos: {
            nombre: safeStr(fullName),
            email: safeStr(email),
            telefono: safeStr(phone),
            entrega,
            direccion: entrega === "envio" ? safeStr(address1) : "",
            codigo_postal: entrega === "envio" ? safeStr(postalCode) : "",
            ciudad: entrega === "envio" ? safeStr(city) : "",
            notas: safeStr(notes),
          },
          p_productos: items.map((it) => it.id),
        });
        if (!error && data != null) numero = Number(data);
      } catch {
        // sin número: se sigue por WhatsApp
      }

      trackEvent("order_whatsapp", "Pedido por WhatsApp", {
        path: "/checkout",
        metadata: { numero, total, items: items.length, entrega },
      });
      await markBuyNowSoldIfApplies(items);

      // 2) Con el pedido registrado, la cesta se vacía y se muestra la confirmación.
      const texto = buildWhatsText(numero);
      if (numero) {
        await saveCart([]);
        setItems([]);
      }
      setPedidoHecho({ numero, texto });

      // 3) WhatsApp con el número de pedido para cerrar pago y entrega con la tienda.
      openWhatsApp(texto);
    } catch (e: any) {
      console.error("Error al finalizar el pedido:", e);
      setErr("No se pudo finalizar el pedido. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
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
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
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

          <View style={{ alignItems: "center", marginTop: 10 }}>
            <Pressable
              onPress={smartBackToHome}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: "#F6FAFD",
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "800" }}>← Volver</Text>
            </Pressable>
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
        // Confirmación: el pedido ya está registrado (o enviado por WhatsApp si no hubo número).
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24, alignItems: "center" }}>
          <View style={{ ...columnStyle, gap: 12, alignItems: "center" }}>
            <MarcaAnimada cual="pareja" ancho={240} />
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 22, textAlign: "center" }}>
              {pedidoHecho.numero ? `Pedido nº ${pedidoHecho.numero} recibido` : "Pedido enviado"}
            </Text>
            <Text style={{ color: COLORS.muted, lineHeight: 22, textAlign: "center" }}>
              {pedidoHecho.numero
                ? "Te escribimos por WhatsApp para confirmar la disponibilidad, el pago y la entrega."
                : "Termina de enviarnos el mensaje por WhatsApp y te confirmamos la disponibilidad, el pago y la entrega."}
            </Text>
            <Pressable
              onPress={() => openWhatsApp(pedidoHecho.texto)}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
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
              <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>Abrir WhatsApp</Text>
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
                label={entrega === "recogida" ? "Recogida" : "Envío"}
                value={entrega === "recogida" ? "En tienda" : shipping === 0 ? "Gratis" : fmtEUR(shipping)}
              />
              <Row label="Total" value={fmtEUR(total)} strong />
            </View>

            {/* Datos envío */}
            <View style={{ gap: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#E3EAF2" }}>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>Entrega</Text>

              {/* Envío a casa o recogida en tienda: dos opciones claras, una pulsada. */}
              <View style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
                {(
                  [
                    { key: "envio", label: "Envío a domicilio", icon: "cube-outline" },
                    { key: "recogida", label: "Recogida en tienda", icon: "storefront-outline" },
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
                  ? "Te avisamos por WhatsApp cuando esté listo para recoger."
                  : "Esto es lo mínimo que necesitamos para preparar tu envío."}
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

              <Pressable
                onPress={() => openWhatsApp(whatsText)}
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="logo-whatsapp" size={16} color={COLORS.text} />
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>Pedir por WhatsApp</Text>
                </View>
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
                ? "Te confirmamos pago y entrega por WhatsApp. Sin pagos por adelantado en la web."
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
