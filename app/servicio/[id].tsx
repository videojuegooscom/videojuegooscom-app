// app/servicio/[id].tsx
/**
 * Qué hace: ficha de un SERVICIO individual (reparación, limpieza,
 * mantenimiento...) — la contraparte de app/producto/[id].tsx pero para
 * servicios, con el mismo lenguaje visual (galería, título, precio,
 * descripción, "Información del servicio", confianza, WhatsApp) y las
 * mismas dos diferencias que pidió Jefe: no hay "Añadir a la cesta" ni
 * selector de Cantidad, y el botón "Comprar ya" pasa a ser "Contratar
 * servicio ahora", que abre components/ContratarServicioModal.tsx (un
 * formulario "pop" igual en espíritu a VenderAhoraModal.tsx pero para
 * contratar un servicio en vez de vender un artículo).
 *
 * No incluye (a diferencia de la ficha de producto): "me gusta" ni el chat
 * privado por artículo — ninguno de los dos se pidió para servicios y cada
 * uno necesitaría su propia tabla/columna en Supabase; si se quieren más
 * adelante, se añaden igual que en producto/[id].tsx.
 *
 * "X Visitas": mismo mecanismo REAL que en producto/[id].tsx (ver
 * sql/services.sql, columna view_count y función increment_service_view),
 * como texto plano junto a "Servicio profesional".
 *
 * Conectado con:
 * - lib/supabase.ts → tablas services, service_media.
 * - sql/services.sql, sql/service_media.sql → esquema y RLS.
 * - components/ContratarServicioModal.tsx → formulario de "Contratar
 *   servicio ahora" (inserta en service_requests, ver
 *   sql/service_requests.sql).
 * - app/servicios.tsx → catálogo del que se navega hasta aquí, y a donde
 *   vuelve "← Volver a servicios".
 */
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { openExternalLink } from "../../lib/openExternalLink";
import ContratarServicioModal from "../../components/ContratarServicioModal";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  bg3: "#F6FAFD",
  card: "#F6FAFD",
  border: "#E3EAF2",
  borderSoft: "#EEF3F8",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  accentDark: "#0E86C4",
};

const BRAND = {
  whatsappPhoneE164: "+34627748741",
};

function fmtEUR(n: number) {
  const safe = Number.isFinite(n) ? n : 0;
  return `${Math.round(safe)}€`;
}

function openWhatsApp(prefill: string) {
  const phone = BRAND.whatsappPhoneE164.replace(/[^\d+]/g, "");
  const text = encodeURIComponent(String(prefill ?? "").trim().slice(0, 500));
  const url = `https://wa.me/${phone.replace("+", "")}?text=${text}`;

  try {
    openExternalLink(url);
  } catch {
    Linking.openURL(`https://api.whatsapp.com/send?phone=${phone.replace("+", "")}&text=${text}`);
  }
}

function smartBack() {
  try {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // ignore
  }
  router.replace("/servicios" as any);
}

type ServiceMedia = {
  id: string;
  publicUrl: string;
  isCover: boolean;
};

type Service = {
  id: string;
  title: string;
  description: string;
  priceEUR: number;
  media: ServiceMedia[];
};

function Pill({ text }: { text: string }) {
  return (
    <View
      style={{
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.bg3,
      }}
    >
      <Text style={{ color: "rgba(11,33,56,0.78)", fontWeight: "800", fontSize: 12.5 }}>{text}</Text>
    </View>
  );
}

function InfoRow({ label, value, isMobile }: { label: string; value: string; isMobile?: boolean }) {
  return (
    <View
      style={{
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between",
        gap: isMobile ? 2 : 10,
      }}
    >
      <Text style={{ color: COLORS.muted2, fontWeight: "700", fontSize: 12.5 }}>{label}</Text>
      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>{value}</Text>
    </View>
  );
}

async function fetchService(serviceId: string): Promise<Service | null> {
  const { data: row, error } = await supabase
    .from("services")
    .select("id,title,description,price_eur")
    .eq("id", serviceId)
    .eq("status", "PUBLISHED")
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!row) return null;

  const { data: media } = await supabase
    .from("service_media")
    .select("id,public_url,is_cover,sort_order")
    .eq("service_id", serviceId)
    .order("is_cover", { ascending: false })
    .order("sort_order", { ascending: true });

  const normalizedMedia: ServiceMedia[] = ((media ?? []) as any[])
    .filter((m) => m.public_url)
    .map((m) => ({ id: m.id, publicUrl: m.public_url, isCover: Boolean(m.is_cover) }));

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    priceEUR: Number(row.price_eur ?? 0),
    media: normalizedMedia,
  };
}

export default function ServicioScreen() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const isTablet = widthSafe >= 700 && widthSafe < 1080;
  const isWide = widthSafe >= 1080;
  const pagePadding = isMobile ? 12 : 16;

  const params = useLocalSearchParams<{ id?: string }>();
  const serviceId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [s, setS] = useState<Service | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [contratarOpen, setContratarOpen] = useState(false);

  async function load() {
    if (!serviceId) {
      setErr("No hemos podido encontrar este servicio.");
      setS(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);
    try {
      const row = await fetchService(serviceId);
      if (!row) {
        setS(null);
        setErr("Este servicio no existe o ya no está disponible. Vuelve al listado de servicios para ver el resto.");
        return;
      }

      setS(row);
      const cover = row.media.find((m) => m.isCover) ?? row.media[0] ?? null;
      setSelectedImageUrl(cover?.publicUrl ?? null);

      supabase
        .rpc("increment_service_view", { service_id: row.id })
        .then(({ data, error }) => {
          if (!error && typeof data === "number") setViewCount(data);
        })
        .catch(() => {});
    } catch (e) {
      console.error("Error cargando el servicio:", e);
      setErr("No hemos podido cargar este servicio en este momento. Inténtalo de nuevo en unos instantes.");
      setS(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  const whatsappText = `Hola, vengo desde Videojuegoszaragoza.com.

Servicio: ${s?.title ?? "Reparación/Limpieza"}
${s?.priceEUR ? `Precio: ${fmtEUR(s.priceEUR)}` : ""}

¿Podéis darme más información sobre este servicio?`;

  async function shareService() {
    if (!s) return;

    const url =
      Platform.OS === "web" && typeof window !== "undefined"
        ? window.location.href
        : `https://videojuegoszaragoza.com/servicio/${s.id}`;

    if (Platform.OS !== "web") {
      try {
        await Share.share({ title: s.title, message: `${s.title} · ${fmtEUR(s.priceEUR)} · ${url}`, url });
      } catch {
        // cancelado
      }
      return;
    }

    const nav: any = typeof navigator !== "undefined" ? navigator : null;
    if (nav?.share) {
      try {
        await nav.share({ title: s.title, url });
      } catch {
        // cancelado
      }
      return;
    }
    if (nav?.clipboard?.writeText) {
      try {
        await nav.clipboard.writeText(url);
        setShareFeedback("Enlace copiado");
        setTimeout(() => setShareFeedback(null), 2000);
      } catch {
        // sin permiso de portapapeles
      }
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "#F6FAFD",
          paddingHorizontal: pagePadding,
          paddingTop: isMobile ? 12 : 14,
          paddingBottom: isMobile ? 12 : 14,
          alignItems: "center",
        }}
      >
        <View style={{ width: "100%", maxWidth: 1240 }}>
          <Pressable
            onPress={smartBack}
            style={({ pressed }) => ({
              opacity: pressed ? 0.88 : 1,
              alignSelf: "flex-start",
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: "#F6FAFD",
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>←</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator />
          <Text style={{ color: COLORS.muted }}>Cargando servicio…</Text>
        </View>
      ) : err ? (
        <View style={{ padding: pagePadding, gap: 12 }}>
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "#F5B5B5",
              backgroundColor: "#FDECEC",
              padding: 14,
              gap: 6,
            }}
          >
            <Text style={{ color: "#B91C1C", fontWeight: "900" }}>No se ha podido cargar el servicio</Text>
            <Text style={{ color: "#7A271A", lineHeight: 20 }}>{err}</Text>
          </View>
          <Pressable
            onPress={load}
            style={({ pressed }) => ({
              opacity: pressed ? 0.88 : 1,
              alignSelf: "flex-start",
              borderRadius: 999,
              paddingVertical: 10,
              paddingHorizontal: 16,
              backgroundColor: COLORS.accent2,
              borderWidth: 1,
              borderColor: COLORS.accentBorder,
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>Reintentar</Text>
          </Pressable>
        </View>
      ) : s ? (
        <ScrollView contentContainerStyle={{ padding: pagePadding, paddingBottom: 40, alignItems: "center" }}>
          <View style={{ width: "100%", maxWidth: 1240, gap: 16 }}>
            <View>
              <Text
                style={{
                  color: COLORS.text,
                  fontSize: isMobile ? 24 : 28,
                  fontWeight: "900",
                  lineHeight: isMobile ? 30 : 32,
                  textAlign: isMobile ? "center" : "left",
                }}
                numberOfLines={isMobile ? 3 : 2}
              >
                {s.title}
              </Text>
              <Text
                style={{
                  color: COLORS.muted,
                  marginTop: 6,
                  lineHeight: 20,
                  textAlign: isMobile ? "center" : "left",
                }}
              >
                Servicio profesional · Reparación y limpieza
              </Text>
            </View>

            <View style={{ flexDirection: isWide ? "row" : "column", gap: 14, alignItems: "stretch" }}>
              <View style={{ flex: isWide ? 1.08 : undefined, minWidth: 0 }}>
                <View
                  style={{
                    borderRadius: 24,
                    backgroundColor: COLORS.card,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {selectedImageUrl ? (
                    <Image
                      source={{ uri: selectedImageUrl }}
                      style={{
                        width: "100%",
                        height: isWide ? 520 : isTablet ? 360 : 260,
                        backgroundColor: "#F8FBFE",
                      }}
                      resizeMode="contain"
                    />
                  ) : (
                    <View
                      style={{
                        height: isWide ? 520 : isTablet ? 360 : 260,
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 22,
                        backgroundColor: COLORS.bg3,
                      }}
                    >
                      <Ionicons name="construct-outline" size={48} color="rgba(11,33,56,0.2)" />
                      <Text style={{ color: COLORS.text, fontWeight: "900", marginTop: 10, fontSize: isMobile ? 17 : 18 }}>
                        Imagen no disponible
                      </Text>
                      <Text style={{ color: COLORS.muted, marginTop: 6, textAlign: "center", lineHeight: 20, maxWidth: 380 }}>
                        Este servicio todavía no tiene una foto disponible, pero puedes consultar el resto
                        de la información y escribirnos si necesitas más detalles.
                      </Text>
                    </View>
                  )}

                  {shareFeedback ? (
                    <View
                      style={{
                        position: "absolute",
                        right: 12,
                        bottom: 12,
                        paddingVertical: 6,
                        paddingHorizontal: 12,
                        borderRadius: 999,
                        backgroundColor: "rgba(11,33,56,0.78)",
                      }}
                    >
                      <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>{shareFeedback}</Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={shareService}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.85 : 1,
                        position: "absolute",
                        right: 12,
                        bottom: 12,
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "rgba(11,33,56,0.60)",
                      })}
                    >
                      <Ionicons name="share-social-outline" size={15} color="#FFFFFF" />
                    </Pressable>
                  )}
                </View>

                {s.media.length > 1 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 10, paddingTop: 10 }}
                  >
                    {s.media.map((m) => {
                      const active = selectedImageUrl === m.publicUrl;
                      return (
                        <Pressable
                          key={m.id}
                          onPress={() => setSelectedImageUrl(m.publicUrl)}
                          style={({ pressed }) => ({
                            opacity: pressed ? 0.88 : 1,
                            width: isMobile ? 74 : 88,
                            height: isMobile ? 74 : 88,
                            borderRadius: 16,
                            overflow: "hidden",
                            borderWidth: 2,
                            borderColor: active ? COLORS.accent : COLORS.border,
                            backgroundColor: "#F6FAFD",
                          })}
                        >
                          <Image source={{ uri: m.publicUrl }} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}
              </View>

              <View style={{ flex: isWide ? 0.92 : undefined, minWidth: 0, gap: 14 }}>
                <View
                  style={{
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.card,
                    padding: isMobile ? 14 : 18,
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.accent} />
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12, letterSpacing: 0.2 }}>
                        Servicio profesional
                      </Text>
                    </View>

                    {viewCount !== null && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <Ionicons name="eye-outline" size={14} color={COLORS.muted} />
                        <Text style={{ color: COLORS.muted, fontWeight: "700", fontSize: 12 }}>
                          {viewCount} {viewCount === 1 ? "Visita" : "Visitas"}
                        </Text>
                      </View>
                    )}
                  </View>

                  <Text style={{ color: COLORS.accent, fontSize: isMobile ? 28 : 34, fontWeight: "900", lineHeight: isMobile ? 32 : 38 }}>
                    {fmtEUR(s.priceEUR)}
                  </Text>

                  <View style={{ gap: 10 }}>
                    <Pressable
                      onPress={() => setContratarOpen(true)}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.9 : 1,
                        borderRadius: 999,
                        paddingVertical: 14,
                        alignItems: "center",
                        backgroundColor: COLORS.accentDark,
                      })}
                    >
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                        Contratar servicio ahora
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => openWhatsApp(whatsappText)}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.88 : 1,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: COLORS.accentBorder,
                        backgroundColor: COLORS.accent2,
                        paddingVertical: 12,
                        alignItems: "center",
                      })}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <Ionicons name="logo-whatsapp" size={16} color={COLORS.text} />
                        <Text style={{ color: COLORS.text, fontWeight: "900" }}>Preguntar por WhatsApp</Text>
                      </View>
                    </Pressable>
                  </View>

                  <View
                    style={{
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: COLORS.borderSoft,
                      backgroundColor: "#F8FBFE",
                      padding: 14,
                      gap: 8,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>Descripción</Text>
                    {s.description.trim() ? (
                      <Text style={{ color: COLORS.muted, lineHeight: 22 }}>{s.description.trim()}</Text>
                    ) : (
                      <Text style={{ color: COLORS.muted2, lineHeight: 22 }}>
                        Todavía no hay una descripción disponible para este servicio. Aun así, puedes
                        preguntarnos por su alcance, tiempo estimado o garantía por WhatsApp.
                      </Text>
                    )}
                  </View>

                  <View
                    style={{
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: COLORS.borderSoft,
                      backgroundColor: "#F8FBFE",
                      padding: 14,
                      gap: 10,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                      Información del servicio
                    </Text>
                    <View style={{ gap: 8 }}>
                      <InfoRow label="Tipo" value="Reparación / Limpieza" isMobile={isMobile} />
                      <InfoRow label="Precio" value={fmtEUR(s.priceEUR)} isMobile={isMobile} />
                      <InfoRow label="Contratación" value="Disponible ahora" isMobile={isMobile} />
                    </View>
                  </View>
                </View>

                <View
                  style={{
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.card,
                    padding: isMobile ? 14 : 18,
                    gap: 12,
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 17 : 18 }}>
                    Contrata con tranquilidad
                  </Text>

                  <Text style={{ color: COLORS.muted, lineHeight: 21 }}>
                    Nuestro equipo se encarga del servicio de principio a fin, con atención directa para
                    resolver cualquier duda antes, durante o después.
                  </Text>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                    <Pill text="Servicio profesional" />
                    <Pill text="Presupuesto claro" />
                    <Pill text="Atención directa" />
                    <Pill text="Garantía del trabajo" />
                  </View>

                  <View
                    style={{
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: COLORS.borderSoft,
                      backgroundColor: "#F4F9FD",
                      padding: 14,
                      gap: 8,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                      ¿Tienes dudas antes de contratar?
                    </Text>
                    <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                      Escríbenos y te confirmamos alcance, tiempo estimado o cualquier otro detalle que
                      necesites.
                    </Text>
                    <Pressable
                      onPress={() => openWhatsApp(whatsappText)}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.88 : 1,
                        marginTop: 2,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: COLORS.accentBorder,
                        backgroundColor: COLORS.accent2,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        alignSelf: isMobile ? "stretch" : "flex-start",
                      })}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <Ionicons name="logo-whatsapp" size={16} color={COLORS.text} />
                        <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                          Preguntar por WhatsApp
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>

            <View style={{ alignItems: "center", paddingTop: 4 }}>
              <Pressable
                onPress={() => router.replace("/servicios" as any)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.88 : 1,
                  borderRadius: 999,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: "#F6FAFD",
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Volver a servicios</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      ) : null}

      <ContratarServicioModal
        visible={contratarOpen}
        service={s ? { id: s.id, title: s.title } : null}
        onClose={() => setContratarOpen(false)}
      />
    </View>
  );
}
