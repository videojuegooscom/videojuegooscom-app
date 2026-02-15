// app/checkout.tsx
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
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

const COLORS = {
  bg: "#071E33",
  bg2: "#061A2C",
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.75)",
  accent: "#00AAE4",
  gold: "#D8B04A",
  danger: "#FF3B30",
  accent2: "rgba(0,170,228,0.16)",
  accentBorder: "rgba(0,170,228,0.45)",
  inputBg: "rgba(255,255,255,0.06)",
};

type CartItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  priceEUR: number;
  qty: number;
};

const CART_KEY = "videojuegoos_cart_v1";

const BRAND = {
  whatsappPhoneE164: "+34627748741",
};

function fmtEUR(n: number) {
  const safe = Number.isFinite(n) ? n : 0;
  return `${Math.round(safe)}€`;
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
  Linking.openURL(url).catch(() => {
    Linking.openURL(`https://api.whatsapp.com/send?phone=${phone.replace("+", "")}&text=${text}`);
  });
}

function inputStyle() {
  return {
    width: "100%" as const,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: COLORS.inputBg,
    paddingVertical: Platform.select({ web: 12, default: 12 }),
    paddingHorizontal: 12,
    color: COLORS.text,
    fontWeight: "800" as const,
  };
}

export default function CheckoutScreen() {
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

    const addrOk = safeStr(address1).length >= 6;
    const cpOk = safeStr(postalCode).length >= 4;
    const cityOk = safeStr(city).length >= 2;

    return nameOk && emailOk && phoneOk && addrOk && cpOk && cityOk;
  }, [items.length, fullName, email, phone, address1, postalCode, city]);

  const whatsText = useMemo(() => {
    const lines: string[] = [];
    lines.push("Hola! Quiero hacer un pedido desde Videojuegoos.com 👇");
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
    if (safeStr(address1)) lines.push(`Dirección: ${safeStr(address1)}`);
    if (safeStr(postalCode) || safeStr(city)) lines.push(`CP/Ciudad: ${safeStr(postalCode)} ${safeStr(city)}`.trim());
    if (safeStr(notes)) {
      lines.push("");
      lines.push(`Notas: ${safeStr(notes)}`);
    }
    lines.push("");
    lines.push("¿Me confirmas disponibilidad y forma de pago/envío?");
    return lines.join("\n");
  }, [items, total, fullName, email, phone, address1, postalCode, city, notes]);

  const bootstrap = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const stored = await loadCart();
      setItems(stored);
    } catch (e: any) {
      setErr(e?.message ?? "Error cargando checkout.");
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
      setErr("Revisa tus datos. Falta algo importante para el envío.");
      return;
    }

    setSubmitting(true);
    try {
      // MVP: todavía NO Stripe. Convertimos por WhatsApp para cerrar ventas YA.
      // Cuando metamos Stripe: aquí llamaremos a /api/stripe/create-checkout-session
      // y redirigiremos al checkout real.
      openWhatsApp(whatsText);

      // Opcional: si quieres vaciar carrito al iniciar “pago”
      // (yo lo haría cuando haya pago confirmado, no aquí)
      // await saveCart([]);
      // setItems([]);
    } catch (e: any) {
      setErr(e?.message ?? "No se pudo iniciar el pago.");
    } finally {
      setSubmitting(false);
    }
  }, [items, formOk, whatsText]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.06)",
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900" }}>Checkout</Text>
            <Text style={{ color: COLORS.muted, marginTop: 4 }}>
              Rápido, claro y sin “sorpresas premium”.
            </Text>
          </View>

          <Pressable
            onPress={smartBackToHome}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: "rgba(255,255,255,0.05)",
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "800" }}>← Volver</Text>
          </Pressable>
        </View>

        {err ? (
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(255,59,48,0.35)",
              backgroundColor: "rgba(255,59,48,0.12)",
              padding: 10,
            }}
          >
            <Text style={{ color: "#FCA5A5", fontWeight: "900" }}>Ojo:</Text>
            <Text style={{ color: "#FEE2E2", marginTop: 4 }}>{err}</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator />
          <Text style={{ color: COLORS.muted }}>Cargando checkout…</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={{ padding: 16, gap: 12 }}>
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.card,
              padding: 16,
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
              Tu carrito está vacío.
            </Text>
            <Text style={{ color: COLORS.muted }}>
              Para pagar, primero añade algo desde el catálogo.
            </Text>

            <Pressable
              onPress={() => router.push("/catalogo")}
              style={{
                marginTop: 6,
                borderRadius: 999,
                paddingVertical: 12,
                paddingHorizontal: 14,
                backgroundColor: "rgba(0,170,228,0.18)",
                borderWidth: 1,
                borderColor: "rgba(0,170,228,0.35)",
                alignSelf: "flex-start",
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Ir al catálogo</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 12 }}>
            {/* Resumen pedido */}
            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.card,
                padding: 14,
                gap: 10,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Resumen</Text>

              {items.map((it) => (
                <View
                  key={it.id}
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(0,0,0,0.12)",
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }} numberOfLines={2}>
                    {it.title}
                  </Text>
                  {it.subtitle ? (
                    <Text style={{ color: COLORS.muted }}>{it.subtitle}</Text>
                  ) : null}

                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: "rgba(255,255,255,0.65)" }}>x{it.qty}</Text>
                    <Text style={{ color: COLORS.gold, fontWeight: "900" }}>
                      {fmtEUR(it.priceEUR * it.qty)}
                    </Text>
                  </View>
                </View>
              ))}

              <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.10)" }} />
              <Row label="Subtotal" value={fmtEUR(subtotal)} />
              <Row label="Envío" value={shipping === 0 ? "Gratis" : fmtEUR(shipping)} />
              <Row label="Total" value={fmtEUR(total)} strong />
            </View>

            {/* Datos envío */}
            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.card,
                padding: 14,
                gap: 10,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Datos de envío</Text>
              <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                Esto es lo mínimo para enviar sin perder tiempo (ni ventas).
              </Text>

              <Field label="Nombre y apellidos" value={fullName} onChangeText={setFullName} placeholder="Ej: Dani G." />
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="ejemplo@gmail.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Field
                label="Teléfono"
                value={phone}
                onChangeText={setPhone}
                placeholder="Ej: 627 748 741"
                keyboardType="phone-pad"
              />
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

              <Field
                label="Notas (opcional)"
                value={notes}
                onChangeText={setNotes}
                placeholder="Ej: entregar por la tarde / no llamar al timbre..."
                multiline
              />

              {/* Micro trust */}
              <View
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(0,0,0,0.12)",
                  padding: 12,
                  gap: 6,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Confianza</Text>
                <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                  ✅ Productos revisados · 🚚 Envío España · 🧾 Recibo · 🧑‍🔧 Soporte
                </Text>
              </View>
            </View>

            {/* Acciones secundarias */}
            <View style={{ alignItems: "center", gap: 10 }}>
              <Pressable
                onPress={() => router.push("/carrito")}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.88 : 1,
                  borderRadius: 999,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.14)",
                  backgroundColor: "rgba(255,255,255,0.06)",
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
                  borderColor: "rgba(255,255,255,0.14)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>📲 Pedir por WhatsApp</Text>
              </Pressable>
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
              backgroundColor: "rgba(6,26,44,0.92)",
              borderTopWidth: 1,
              borderTopColor: "rgba(255,255,255,0.10)",
            }}
          >
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                disabled={!formOk || submitting}
                onPress={onPay}
                style={({ pressed }) => ({
                  flex: 1,
                  opacity: !formOk || submitting ? 0.45 : pressed ? 0.88 : 1,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: COLORS.accentBorder,
                  backgroundColor: COLORS.accent2,
                  paddingVertical: 14,
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                  {submitting ? "Iniciando…" : "Pagar ahora"}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.70)", marginTop: 4, fontWeight: "800", fontSize: 12 }}>
                  Total: {fmtEUR(total)}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.replace("/catalogo")}
                style={({ pressed }) => ({
                  flex: 1,
                  opacity: pressed ? 0.88 : 1,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.14)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  paddingVertical: 14,
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Seguir viendo</Text>
                <Text style={{ color: "rgba(255,255,255,0.70)", marginTop: 4, fontWeight: "800", fontSize: 12 }}>
                  Volver al catálogo
                </Text>
              </Pressable>
            </View>

            {!formOk ? (
              <Text style={{ color: "rgba(255,255,255,0.60)", marginTop: 10, textAlign: "center" }}>
                Completa los datos de envío para activar “Pagar ahora”.
              </Text>
            ) : null}
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
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: strong ? "900" : "700" }}>
        {label}
      </Text>
      <Text style={{ color: "#FFFFFF", fontWeight: strong ? "900" : "800" }}>{value}</Text>
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
      <Text style={{ color: "rgba(255,255,255,0.80)", fontWeight: "800" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.45)"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        style={{
          width: "100%",
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.14)",
          backgroundColor: "rgba(255,255,255,0.06)",
          paddingVertical: Platform.select({ web: 12, default: 12 }),
          paddingHorizontal: 12,
          color: "#FFFFFF",
          fontWeight: "800",
          minHeight: multiline ? 90 : undefined,
          textAlignVertical: multiline ? "top" : "auto",
        }}
      />
    </View>
  );
}
