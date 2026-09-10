// app/admin/redes-sociales.tsx
/**
 * Qué hace: pantalla de administración "Redes sociales". Desde aquí Daniel
 * rellena el enlace de cada red/plataforma (Instagram, TikTok, WhatsApp,
 * YouTube, Gmail, Apple Maps, Facebook Marketplace, Wallapop, Vinted),
 * decide cuáles están activas, en qué orden aparecen, y edita el título que
 * se ve encima de los iconos ("Síguenos" por defecto) — sin tocar código ni
 * depender de un nuevo despliegue.
 *
 * Cómo funciona:
 * - Las filas ya existen en la tabla "social_links" (ver migraciones
 *   create_social_links y social_links_add_platforms_and_title) — esta
 *   pantalla lee y actualiza sus columnas "url", "enabled" y "sort_order"
 *   (lectura pública, escritura solo admin).
 * - El título del bloque vive en site_settings.social_links_title (misma
 *   fila única que el SEO, ver app/admin/marca-seo.tsx) — se lee y guarda
 *   igual que el resto de campos de esa tabla.
 * - "Activar" una red la hace aparecer de inmediato en los tres sitios que
 *   la muestran (ver components/SocialLinks.tsx) Y se la menciona a Blue IA
 *   para que la recomiende (ver api/blue-ia.ts). Desactivarla la quita de
 *   los tres sitios sin borrar el enlace guardado — así se puede "quitar" y
 *   volver a "poner" sin tener que escribirlo de nuevo.
 * - Orden: las flechas ▲/▼ de cada tarjeta intercambian su posición con la
 *   de arriba/abajo (solo en memoria, hasta pulsar "Guardar cambios") — el
 *   número real (`sort_order`) se recalcula al guardar según el orden final
 *   de la lista, así siempre queda 1,2,3... sin huecos. Activar todas a la
 *   vez no tiene ningún límite: el bloque en la tienda las reparte en varias
 *   filas automáticamente (ver components/SocialLinks.tsx), así que activar
 *   las 9 no rompe nada.
 * - No hace falta pegar la URL completa en todos los casos: WhatsApp acepta
 *   un número de teléfono normal (se arma el enlace wa.me solo), Gmail
 *   acepta solo la dirección de correo (se arma el "mailto:" solo), y Apple
 *   Maps acepta solo una dirección o nombre de sitio (se arma el enlace de
 *   búsqueda solo) — el detalle exacto está en components/SocialLinks.tsx
 *   (buildSocialHref).
 * - Un único botón "Guardar cambios" guarda todas las filas (enlace, activa,
 *   orden) y el título a la vez.
 * - Abrir la app o la web al tocar cada icono ya lo resuelve el propio
 *   sistema operativo del usuario (enlaces universales de Instagram,
 *   Facebook, YouTube, WhatsApp, Wallapop, Vinted y Apple Maps) — no hace
 *   falta ninguna configuración aquí (ver la nota larga en
 *   components/SocialLinks.tsx). El propio icono, en cambio, sí se intenta
 *   abrir en Chrome en vez de en el navegador actual — ver
 *   lib/openExternalLink.ts.
 *
 * Sin "burbujas": las tarjetas de esta pantalla ya no llevan borde ni sombra
 * (Daniel pidió un aspecto limpio en toda la app) — el espaciado entre ellas
 * y una línea fina bajo la cabecera son suficientes para distinguir dónde
 * empieza cada bloque.
 *
 * Campos de texto que no dejaban escribir bien (Apple Maps, Wallapop...):
 * al enfocar un campo cerca del final de una lista larga, el teclado móvil a
 * veces lo tapa o el scroll no lo centra solo — cada campo de texto de esta
 * pantalla ahora se desplaza a la vista al enfocarlo (ver `scrollFieldIntoView`
 * más abajo), sin depender de que el navegador lo haga bien por su cuenta.
 *
 * Conectado con:
 * - components/SocialLinks.tsx → quien lee estas mismas filas y el título,
 *   y pinta los iconos en el pie de página de Inicio, Perfil y la Cesta.
 * - api/blue-ia.ts → lee las redes activas para que Blue IA las conozca y
 *   las recomiende cuando encaje en la conversación.
 * - app/admin/index.tsx → tarjeta "Redes sociales" que lleva aquí.
 * - app/admin/_layout.tsx → registra esta ruta ("redes-sociales") en el Stack.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";

type SocialPlatform =
  | "instagram"
  | "tiktok"
  | "whatsapp"
  | "youtube"
  | "gmail"
  | "apple_maps"
  | "facebook_marketplace"
  | "wallapop"
  | "vinted";

type SocialLinkRow = {
  platform: SocialPlatform;
  label: string;
  url: string | null;
  enabled: boolean;
  sort_order: number;
};

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accentDark: "#0F8FCC",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  success: "#15803D",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  dangerBorder: "#FDA4AF",
};

const PLATFORM_META: Record<
  SocialPlatform,
  {
    icon: (color: string, size: number) => React.ReactNode;
    placeholder: string;
    hint: string;
  }
> = {
  instagram: {
    icon: (color, size) => <Ionicons name="logo-instagram" size={size} color={color} />,
    placeholder: "https://instagram.com/tu_usuario",
    hint: "Pega el enlace a tu perfil de Instagram.",
  },
  tiktok: {
    icon: (color, size) => <MaterialIcons name="tiktok" size={size} color={color} />,
    placeholder: "https://tiktok.com/@tu_usuario",
    hint: "Pega el enlace a tu perfil de TikTok.",
  },
  whatsapp: {
    icon: (color, size) => <Ionicons name="logo-whatsapp" size={size} color={color} />,
    placeholder: "34612345678 (o un enlace de canal/comunidad)",
    hint: "Vale con el número con prefijo de país, sin espacios ni signos — o pega un enlace de canal de WhatsApp.",
  },
  youtube: {
    icon: (color, size) => <Ionicons name="logo-youtube" size={size} color={color} />,
    placeholder: "https://youtube.com/@tu_canal",
    hint: "Pega el enlace a tu canal de YouTube.",
  },
  gmail: {
    icon: (color, size) => <MaterialCommunityIcons name="gmail" size={size} color={color} />,
    placeholder: "tienda@gmail.com",
    hint: "Solo la dirección de correo — se arma el enlace para abrir el correo automáticamente.",
  },
  apple_maps: {
    // No existe un icono de "Mapas de Apple" en ninguna fuente incluida en
    // el proyecto — se usa el logo de Apple como referencia visual.
    icon: (color, size) => <Ionicons name="logo-apple" size={size} color={color} />,
    placeholder: "Tu dirección o el enlace que da Apple Maps al compartir la ubicación",
    hint: "Pega el enlace de Apple Maps (botón Compartir → Copiar) o simplemente escribe la dirección de la tienda.",
  },
  facebook_marketplace: {
    // No existe un icono específico de "Marketplace" — se usa el logo de
    // Facebook.
    icon: (color, size) => <Ionicons name="logo-facebook" size={size} color={color} />,
    placeholder: "https://facebook.com/marketplace/profile/tu_perfil",
    hint: "Pega el enlace a tu perfil o página de Facebook Marketplace.",
  },
  wallapop: {
    icon: (color, size) => (
      <Text style={{ color, fontWeight: "900", fontSize: Math.round(size * 0.9) }}>W</Text>
    ),
    placeholder: "https://wallapop.com/user/tu_usuario",
    hint: "Pega el enlace a tu perfil de Wallapop.",
  },
  vinted: {
    icon: (color, size) => (
      <Text style={{ color, fontWeight: "900", fontSize: Math.round(size * 0.9) }}>V</Text>
    ),
    placeholder: "https://vinted.es/member/tu_usuario",
    hint: "Pega el enlace a tu perfil de Vinted.",
  },
};

// En vez de borde+sombra (la "burbuja" que Daniel quería quitar de toda la
// app), cada tarjeta de esta pantalla es solo un bloque con su propio fondo
// y esquinas redondeadas — el espacio entre tarjetas (gap) ya basta para
// distinguir dónde empieza cada una.
function smartBackAdminHome() {
  try {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // ignore
  }
  router.replace("/admin");
}

// Al enfocar un campo de texto en web, lo desplaza suavemente al centro de
// la pantalla — en listas largas como esta (9 tarjetas), el ajuste
// automático del navegador al abrir el teclado no siempre centra bien el
// campo, y por eso a veces "no dejaba escribir" en las últimas tarjetas
// (Apple Maps, Wallapop...): el campo quedaba tapado por el propio teclado.
// En nativo (Platform.OS !== "web") no hace falta nada: el propio sistema ya
// lo resuelve.
function scrollFieldIntoView(e: any) {
  if (Platform.OS !== "web") return;
  const node = e?.target;
  if (node && typeof node.scrollIntoView === "function") {
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

export default function AdminRedesSociales() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const pagePadding = isMobile ? 12 : 16;

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [rows, setRows] = useState<SocialLinkRow[]>([]);
  const [followTitle, setFollowTitle] = useState("Síguenos");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const [linksRes, settingsRes] = await Promise.all([
        supabase
          .from("social_links")
          .select("platform,label,url,enabled,sort_order")
          .order("sort_order", { ascending: true }),
        supabase.from("site_settings").select("social_links_title").eq("id", 1).maybeSingle(),
      ]);

      if (linksRes.error) throw linksRes.error;
      setRows(Array.isArray(linksRes.data) ? (linksRes.data as SocialLinkRow[]) : []);

      if (!settingsRes.error && settingsRes.data?.social_links_title) {
        setFollowTitle(settingsRes.data.social_links_title);
      }
    } catch (e: any) {
      console.error("Error cargando redes sociales:", e);
      setLoadErr("No se ha podido cargar la configuración. Comprueba tu conexión e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateRow(platform: SocialPlatform, patch: Partial<SocialLinkRow>) {
    setRows((prev) => prev.map((r) => (r.platform === platform ? { ...r, ...patch } : r)));
    setMsg(null);
  }

  // Intercambia una tarjeta con la de arriba (-1) o la de abajo (+1). El
  // número real de "sort_order" se reasigna al guardar según la posición
  // final de la lista — aquí solo hace falta reordenar el array.
  function moveRow(platform: SocialPlatform, direction: -1 | 1) {
    setRows((prev) => {
      const index = prev.findIndex((r) => r.platform === platform);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
    setMsg(null);
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const cleanTitle = followTitle.trim() || "Síguenos";

      const results = await Promise.all([
        ...rows.map((r, index) =>
          supabase
            .from("social_links")
            .update({ url: r.url?.trim() || null, enabled: r.enabled, sort_order: index + 1 })
            .eq("platform", r.platform)
        ),
        supabase.from("site_settings").update({ social_links_title: cleanTitle }).eq("id", 1),
      ]);

      const firstError = results.find((r) => r.error)?.error;
      if (firstError) throw firstError;

      setFollowTitle(cleanTitle);
      setRows((prev) => prev.map((r, index) => ({ ...r, sort_order: index + 1 })));
      setMsg({ type: "ok", text: "Guardado. Ya se ve así en el pie de página, Perfil, la Cesta y Blue IA." });
    } catch (e: any) {
      console.error("Error guardando redes sociales:", e);
      setMsg({ type: "error", text: "No se ha podido guardar. Inténtalo de nuevo." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
          paddingHorizontal: pagePadding,
          paddingTop: isMobile ? 12 : 14,
          paddingBottom: 12,
          alignItems: "center",
        }}
      >
        <View style={{ width: "100%", maxWidth: 860, gap: 10 }}>
          <View
            style={{
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "space-between",
              alignItems: isMobile ? "stretch" : "center",
              gap: 10,
            }}
          >
            <View style={{ flex: isMobile ? undefined : 1 }}>
              <Text
                style={{
                  color: COLORS.text,
                  fontSize: isMobile ? 22 : 24,
                  fontWeight: "900",
                  lineHeight: isMobile ? 28 : 30,
                  textAlign: isMobile ? "center" : "left",
                }}
              >
                Redes sociales
              </Text>
              <Text
                style={{
                  color: COLORS.muted,
                  marginTop: 4,
                  lineHeight: 20,
                  textAlign: isMobile ? "center" : "left",
                }}
              >
                Los enlaces que se ven en el pie de página, Perfil y la Cesta — y que Blue IA
                recomienda seguir.
              </Text>
            </View>

            <Pressable
              onPress={smartBackAdminHome}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 999,
                backgroundColor: "#F6FAFD",
                alignSelf: isMobile ? "flex-start" : "auto",
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Volver</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={COLORS.text} />
          <Text style={{ color: COLORS.muted }}>Cargando…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: pagePadding, paddingBottom: 40, alignItems: "center" }}>
          <View style={{ width: "100%", maxWidth: 860, gap: 14 }}>
            {!!loadErr && (
              <View
                style={{
                  borderRadius: 14,
                  backgroundColor: COLORS.dangerBg,
                  padding: 10,
                }}
              >
                <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20 }}>{loadErr}</Text>
              </View>
            )}

            <View
              style={{
                borderRadius: 20,
                backgroundColor: COLORS.card,
                padding: isMobile ? 14 : 18,
                gap: 10,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                Título del bloque
              </Text>
              <TextInput
                value={followTitle}
                onChangeText={setFollowTitle}
                onFocus={scrollFieldIntoView}
                placeholder="Síguenos"
                placeholderTextColor="rgba(11,33,56,0.40)"
                autoCapitalize="sentences"
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: COLORS.text,
                  backgroundColor: COLORS.cardSoft,
                  // 16px es el mínimo que evita que Safari/iOS haga zoom
                  // automático al enfocar el campo (mismo motivo que en el
                  // cuadro de Blue IA, ver app/(tabs)/blue-ia.tsx).
                  fontSize: 16,
                }}
              />
              <Text style={{ color: COLORS.muted2, fontSize: 11.5, lineHeight: 16 }}>
                El texto que aparece encima de los iconos en el pie de página, Perfil y la Cesta.
              </Text>
            </View>

            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: COLORS.border,
                paddingTop: 4,
              }}
            />

            {rows.map((r, index) => {
              const meta = PLATFORM_META[r.platform];
              if (!meta) return null;
              return (
                <View
                  key={r.platform}
                  style={{
                    borderRadius: 20,
                    backgroundColor: COLORS.card,
                    padding: isMobile ? 14 : 18,
                    gap: 10,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 12,
                        backgroundColor: COLORS.accent2,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {meta.icon(COLORS.accentDark, 18)}
                    </View>
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, flex: 1 }}>
                      {r.label}
                    </Text>

                    {/* Orden: sube o baja esta tarjeta respecto a las demás —
                        el número real se recalcula al guardar. */}
                    <View style={{ flexDirection: "row", gap: 2 }}>
                      <Pressable
                        onPress={() => moveRow(r.platform, -1)}
                        disabled={index === 0}
                        hitSlop={6}
                        style={({ pressed }) => ({
                          width: 30,
                          height: 30,
                          borderRadius: 10,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: COLORS.cardSoft,
                          opacity: index === 0 ? 0.35 : pressed ? 0.8 : 1,
                        })}
                      >
                        <Ionicons name="chevron-up" size={16} color={COLORS.text} />
                      </Pressable>
                      <Pressable
                        onPress={() => moveRow(r.platform, 1)}
                        disabled={index === rows.length - 1}
                        hitSlop={6}
                        style={({ pressed }) => ({
                          width: 30,
                          height: 30,
                          borderRadius: 10,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: COLORS.cardSoft,
                          opacity: index === rows.length - 1 ? 0.35 : pressed ? 0.8 : 1,
                        })}
                      >
                        <Ionicons name="chevron-down" size={16} color={COLORS.text} />
                      </Pressable>
                    </View>

                    <Switch
                      value={r.enabled}
                      onValueChange={(value) => updateRow(r.platform, { enabled: value })}
                      trackColor={{ false: "#D9E3EC", true: COLORS.accentBorder }}
                      thumbColor={r.enabled ? COLORS.accent : "#F4F4F5"}
                    />
                  </View>

                  <TextInput
                    value={r.url ?? ""}
                    onChangeText={(text) => updateRow(r.platform, { url: text })}
                    onFocus={scrollFieldIntoView}
                    placeholder={meta.placeholder}
                    placeholderTextColor="rgba(11,33,56,0.40)"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType={r.platform === "gmail" ? "email-address" : "default"}
                    style={{
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: COLORS.text,
                      backgroundColor: COLORS.cardSoft,
                      // 16px es el mínimo que evita que Safari/iOS haga zoom
                      // automático al enfocar el campo — con menos de 16px
                      // el navegador da por hecho que hay que acercar la
                      // imagen para poder escribir cómodo.
                      fontSize: 16,
                    }}
                  />
                  <Text style={{ color: COLORS.muted2, fontSize: 11.5, lineHeight: 16 }}>{meta.hint}</Text>

                  {r.enabled && !r.url?.trim() ? (
                    <Text style={{ color: COLORS.danger, fontSize: 11.5, fontWeight: "800" }}>
                      Está activada pero no tiene enlace todavía — no aparecerá hasta que lo rellenes.
                    </Text>
                  ) : null}
                </View>
              );
            })}

            {!!msg && (
              <Text
                style={{
                  color: msg.type === "ok" ? COLORS.success : COLORS.danger,
                  fontWeight: "800",
                  fontSize: 12.5,
                  textAlign: "center",
                }}
              >
                {msg.text}
              </Text>
            )}

            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={({ pressed }) => ({
                opacity: pressed || saving ? 0.75 : 1,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: COLORS.accent,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
              })}
            >
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </Text>
            </Pressable>

            <View
              style={{
                borderRadius: 16,
                backgroundColor: COLORS.cardSoft,
                padding: 12,
                flexDirection: "row",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <Ionicons name="information-circle-outline" size={16} color={COLORS.muted2} />
              <Text style={{ color: COLORS.muted, lineHeight: 18, fontSize: 12.5, flex: 1 }}>
                Los cambios se aplican al momento, sin esperar a un nuevo despliegue: en cuanto
                guardes, el icono aparece o desaparece en el pie de página, Perfil y la Cesta, y
                Blue IA ya lo sabe. Puedes activar las 9 redes a la vez sin problema — se reparten
                solas en varias filas.
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
