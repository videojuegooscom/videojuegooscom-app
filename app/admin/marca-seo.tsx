// app/admin/marca-seo.tsx
/**
 * Qué hace: pantalla de administración "Marca y SEO". Desde aquí Daniel
 * sube el logo de la tienda y edita el título y la descripción que Google
 * muestra en los resultados de búsqueda (y que también se ven en la pestaña
 * del navegador) — sin tocar código ni depender de un nuevo despliegue.
 *
 * Cómo funciona:
 * - Todo se guarda en una única fila de la tabla "site_settings" (id=1):
 *   seo_title, seo_description, logo_url (ver migración
 *   create_site_settings_seo_and_logo en Supabase). Lectura pública (para
 *   que el título/logo se vean bien para cualquier visitante), escritura
 *   solo admin.
 * - El logo se sube al bucket de Storage "site-assets" (público, solo el
 *   admin puede escribir) con pickSingleImageWeb(), una versión mínima —
 *   solo imágenes, un archivo, sin conversión HEIC — del selector de
 *   archivos que ya usa el resto del panel (ver
 *   app/admin/products/products.utils.ts → pickMediaFilesWeb). Como el
 *   resto de subidas de archivos del panel, solo funciona desde la versión
 *   web (Platform.OS === "web").
 * - ALCANCE (decisión tomada con Daniel): esto cubre cómo se ve la tienda en
 *   Google y en el navegador (título de pestaña + <meta name="description">
 *   + icono), aplicado al momento con expo-router/head (ver
 *   app/_layout.tsx o el hook useSiteSettingsHead más abajo). NO genera
 *   todavía la tarjeta de vista previa automática al pegar el enlace en
 *   WhatsApp/Facebook — esos programas no ejecutan JavaScript, así que
 *   necesitarían una pieza aparte (una función de Vercel) que de momento no
 *   se ha construido. Si más adelante se quiere, es un paso siguiente.
 *
 * Conectado con:
 * - components/SiteHead.tsx → lee esta misma tabla y aplica el título,
 *   descripción, icono y og:image en cada pantalla.
 * - app/admin/index.tsx → tarjeta "Marca y SEO" que lleva aquí.
 * - app/admin/_layout.tsx → registra esta ruta ("marca-seo") en el Stack.
 */
import React, { useCallback, useEffect, useState } from "react";
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
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import SmartImage from "../../components/SmartImage";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

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

const LOGO_BUCKET = "site-assets";
const MAX_LOGO_SIZE_MB = 2;
const MAX_LOGO_SIZE_BYTES = MAX_LOGO_SIZE_MB * 1024 * 1024;
const SEO_TITLE_MAX = 60;
const SEO_DESC_MAX = 160;

type SiteSettingsRow = {
  seo_title: string;
  seo_description: string;
  logo_url: string | null;
};

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

// Selector de UN único archivo de imagen (sin vídeo, sin HEIC): pensado para
// el logo, no para las fotos de producto/servicio (eso ya lo cubre
// pickMediaFilesWeb en products.utils.ts). Solo funciona en web, igual que
// el resto de subidas de archivos del panel.
function pickSingleImageWeb(): Promise<File | null> {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return Promise.reject(
      new Error("La subida de archivos solo está disponible desde la versión web del panel.")
    );
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = false;
    input.accept = "image/jpeg,image/png,image/webp";

    let settled = false;
    let focusTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      if (focusTimer) clearTimeout(focusTimer);
      window.removeEventListener("focus", onWindowFocus);
      resolve(file);
    };

    function onWindowFocus() {
      window.removeEventListener("focus", onWindowFocus);
      focusTimer = setTimeout(() => finish(null), 900);
    }

    input.addEventListener("cancel", () => finish(null));
    window.addEventListener("focus", onWindowFocus);

    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      finish(file);
    };

    input.click();
  });
}

function extFromMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export default function AdminMarcaSeo() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const pagePadding = isMobile ? 12 : 16;

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const [savingSeo, setSavingSeo] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);

  const [seoMsg, setSeoMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [logoMsg, setLogoMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const { data, error } = await supabase
        .from("site_settings")
        .select("seo_title, seo_description, logo_url")
        .eq("id", 1)
        .maybeSingle();

      if (error) throw error;

      const row = (data as SiteSettingsRow | null) ?? null;
      setSeoTitle(row?.seo_title ?? "");
      setSeoDescription(row?.seo_description ?? "");
      setLogoUrl(row?.logo_url ?? null);
    } catch (e: any) {
      console.error("Error cargando marca y SEO:", e);
      setLoadErr("No se ha podido cargar la configuración. Comprueba tu conexión e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveSeo() {
    const title = seoTitle.trim();
    const description = seoDescription.trim();

    if (!title) {
      setSeoMsg({ type: "error", text: "El título no puede quedar vacío." });
      return;
    }
    if (!description) {
      setSeoMsg({ type: "error", text: "La descripción no puede quedar vacía." });
      return;
    }

    setSavingSeo(true);
    setSeoMsg(null);
    try {
      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("site_settings")
        .update({
          seo_title: title,
          seo_description: description,
          updated_by: userData?.user?.id ?? null,
        })
        .eq("id", 1);

      if (error) throw error;

      setSeoMsg({ type: "ok", text: "Guardado. Ya se ve así en Google y en la pestaña del navegador." });
    } catch (e: any) {
      console.error("Error guardando SEO:", e);
      setSeoMsg({ type: "error", text: "No se ha podido guardar. Inténtalo de nuevo." });
    } finally {
      setSavingSeo(false);
    }
  }

  async function handlePickLogo() {
    setLogoMsg(null);

    let file: File | null;
    try {
      file = await pickSingleImageWeb();
    } catch (e: any) {
      setLogoMsg({ type: "error", text: String(e?.message ?? "No se pudo abrir el selector de archivos.") });
      return;
    }

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setLogoMsg({ type: "error", text: "Formato no compatible. Usa JPG, PNG o WEBP." });
      return;
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setLogoMsg({ type: "error", text: `El archivo supera el máximo de ${MAX_LOGO_SIZE_MB} MB.` });
      return;
    }

    setUploadingLogo(true);
    try {
      const ext = extFromMime(file.type);
      const storagePath = `logo-${Date.now()}.${ext}`;
      const previousUrl = logoUrl;

      const uploadRes = await supabase.storage.from(LOGO_BUCKET).upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (uploadRes.error) throw uploadRes.error;

      const { data: publicData } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(storagePath);
      const publicUrl = publicData?.publicUrl ?? "";

      const { data: userData } = await supabase.auth.getUser();

      const { error: updateError } = await supabase
        .from("site_settings")
        .update({ logo_url: publicUrl, updated_by: userData?.user?.id ?? null })
        .eq("id", 1);
      if (updateError) throw updateError;

      setLogoUrl(publicUrl);
      setLogoMsg({ type: "ok", text: "Logo actualizado. Ya se está usando en Google y en el navegador." });

      // Borra el logo anterior del Storage (si había uno) para no acumular
      // archivos huérfanos — no es grave si falla, solo se avisa en consola.
      if (previousUrl) {
        const marker = `/${LOGO_BUCKET}/`;
        const idx = previousUrl.indexOf(marker);
        if (idx >= 0) {
          const previousPath = previousUrl.slice(idx + marker.length);
          if (previousPath) {
            supabase.storage.from(LOGO_BUCKET).remove([previousPath]).catch(() => {});
          }
        }
      }
    } catch (e: any) {
      console.error("Error subiendo el logo:", e);
      setLogoMsg({ type: "error", text: "No se ha podido subir el logo. Inténtalo de nuevo." });
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleRemoveLogo() {
    if (!logoUrl) return;

    setRemovingLogo(true);
    setLogoMsg(null);
    try {
      const { error } = await supabase.from("site_settings").update({ logo_url: null }).eq("id", 1);
      if (error) throw error;

      const marker = `/${LOGO_BUCKET}/`;
      const idx = logoUrl.indexOf(marker);
      if (idx >= 0) {
        const path = logoUrl.slice(idx + marker.length);
        if (path) {
          supabase.storage.from(LOGO_BUCKET).remove([path]).catch(() => {});
        }
      }

      setLogoUrl(null);
      setLogoMsg({ type: "ok", text: "Logo quitado." });
    } catch (e: any) {
      console.error("Error quitando el logo:", e);
      setLogoMsg({ type: "error", text: "No se ha podido quitar el logo. Inténtalo de nuevo." });
    } finally {
      setRemovingLogo(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "#E3EAF2",
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
                Marca y SEO
              </Text>
              <Text
                style={{
                  color: COLORS.muted,
                  marginTop: 4,
                  lineHeight: 20,
                  textAlign: isMobile ? "center" : "left",
                }}
              >
                El logo y el texto que se ven al buscar la tienda en Google, y en la pestaña del navegador.
              </Text>
            </View>

            <Pressable
              onPress={smartBackAdminHome}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: COLORS.border,
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

            {/* --- Logo de la tienda --- */}
            <View
              style={{
                borderRadius: 20,
                backgroundColor: COLORS.card,
                padding: isMobile ? 14 : 18,
                gap: 12,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="image-outline" size={18} color={COLORS.accentDark} />
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>Logo de la tienda</Text>
              </View>

              <View
                style={{
                  flexDirection: isMobile ? "column" : "row",
                  gap: 14,
                  alignItems: isMobile ? "stretch" : "flex-start",
                }}
              >
                <View
                  style={{
                    width: 112,
                    height: 112,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.cardSoft,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    alignSelf: isMobile ? "center" : "auto",
                  }}
                >
                  {logoUrl ? (
                    <SmartImage uri={logoUrl} contentFit="contain" style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <Ionicons name="image-outline" size={30} color={COLORS.muted2} />
                  )}
                </View>

                <View style={{ flex: 1, gap: 10 }}>
                  <View
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 12,
                      gap: 4,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12.5 }}>
                      Medidas exactas recomendadas
                    </Text>
                    <Text style={{ color: COLORS.text, fontSize: 12.5, lineHeight: 18 }}>
                      Cuadrada, 512 × 512 píxeles (o 1024 × 1024 si tienes calidad de sobra). Formato
                      JPG, PNG o WEBP, con fondo sólido (evita transparencias: en algunos sitios se
                      ven con fondo negro). Peso máximo {MAX_LOGO_SIZE_MB} MB.
                    </Text>
                    <Text style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: 16, marginTop: 4 }}>
                      Con esa medida se ve bien tanto en el resultado de Google como en la pestaña del
                      navegador. La tarjeta que se ve al pegar el enlace en WhatsApp o Facebook no está
                      cubierta todavía — es un paso aparte, si en algún momento lo quieres.
                    </Text>
                  </View>

                  {!!logoMsg && (
                    <Text
                      style={{
                        color: logoMsg.type === "ok" ? COLORS.success : COLORS.danger,
                        fontWeight: "800",
                        fontSize: 12.5,
                      }}
                    >
                      {logoMsg.text}
                    </Text>
                  )}

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    <Pressable
                      onPress={handlePickLogo}
                      disabled={uploadingLogo}
                      style={({ pressed }) => ({
                        opacity: pressed || uploadingLogo ? 0.75 : 1,
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        backgroundColor: COLORS.accent,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      })}
                    >
                      {uploadingLogo ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Ionicons name="cloud-upload-outline" size={15} color="#FFFFFF" />
                      )}
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13 }}>
                        {logoUrl ? "Cambiar logo" : "Subir logo"}
                      </Text>
                    </Pressable>

                    {logoUrl ? (
                      <Pressable
                        onPress={handleRemoveLogo}
                        disabled={removingLogo}
                        style={({ pressed }) => ({
                          opacity: pressed || removingLogo ? 0.75 : 1,
                          paddingVertical: 10,
                          paddingHorizontal: 14,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: COLORS.dangerBorder,
                          backgroundColor: COLORS.dangerBg,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        })}
                      >
                        {removingLogo ? (
                          <ActivityIndicator size="small" color={COLORS.danger} />
                        ) : (
                          <Ionicons name="trash-outline" size={15} color={COLORS.danger} />
                        )}
                        <Text style={{ color: COLORS.danger, fontWeight: "900", fontSize: 13 }}>Quitar</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>

            {/* --- SEO: título y descripción --- */}
            <View
              style={{
                borderRadius: 20,
                backgroundColor: COLORS.card,
                padding: isMobile ? 14 : 18,
                gap: 12,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="search-outline" size={18} color={COLORS.accentDark} />
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                  Cómo aparece en Google
                </Text>
              </View>

              {/* Vista previa tipo resultado de Google */}
              <View
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: "#FFFFFF",
                  padding: 12,
                  gap: 3,
                }}
              >
                <Text style={{ color: "#1a0dab", fontSize: 16, fontWeight: "600" }} numberOfLines={1}>
                  {seoTitle.trim() || "Título de la tienda"}
                </Text>
                <Text style={{ color: "#006621", fontSize: 12.5 }}>
                  videojuegoszaragoza.com
                </Text>
                <Text style={{ color: "#545454", fontSize: 12.5, lineHeight: 17 }} numberOfLines={2}>
                  {seoDescription.trim() || "La descripción aparecerá aquí, tal y como la vería alguien buscando en Google."}
                </Text>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>
                  Título (lo que se ve en azul en Google y en la pestaña del navegador)
                </Text>
                <TextInput
                  value={seoTitle}
                  onChangeText={setSeoTitle}
                  placeholder="Videojuegoszaragoza.com — Compra y venta de videojuegos"
                  placeholderTextColor="rgba(11,33,56,0.40)"
                  maxLength={SEO_TITLE_MAX + 20}
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: COLORS.text,
                    backgroundColor: COLORS.cardSoft,
                    fontSize: 13,
                  }}
                />
                <Text
                  style={{
                    color: seoTitle.trim().length > SEO_TITLE_MAX ? COLORS.danger : COLORS.muted2,
                    fontSize: 11,
                    fontWeight: "700",
                  }}
                >
                  {seoTitle.trim().length}/{SEO_TITLE_MAX} — pasado este largo, Google suele recortarlo con "…"
                </Text>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>
                  Descripción (el texto gris debajo, en el resultado de Google)
                </Text>
                <TextInput
                  value={seoDescription}
                  onChangeText={setSeoDescription}
                  placeholder="Compra y vende videoconsolas, videojuegos y accesorios en Zaragoza. Envíos a toda España."
                  placeholderTextColor="rgba(11,33,56,0.40)"
                  multiline
                  numberOfLines={3}
                  maxLength={SEO_DESC_MAX + 40}
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: COLORS.text,
                    backgroundColor: COLORS.cardSoft,
                    fontSize: 13,
                    minHeight: 76,
                    textAlignVertical: "top",
                  }}
                />
                <Text
                  style={{
                    color: seoDescription.trim().length > SEO_DESC_MAX ? COLORS.danger : COLORS.muted2,
                    fontSize: 11,
                    fontWeight: "700",
                  }}
                >
                  {seoDescription.trim().length}/{SEO_DESC_MAX} — pasado este largo, Google suele recortarla con "…"
                </Text>
              </View>

              {!!seoMsg && (
                <Text
                  style={{
                    color: seoMsg.type === "ok" ? COLORS.success : COLORS.danger,
                    fontWeight: "800",
                    fontSize: 12.5,
                  }}
                >
                  {seoMsg.text}
                </Text>
              )}

              <Pressable
                onPress={handleSaveSeo}
                disabled={savingSeo}
                style={({ pressed }) => ({
                  opacity: pressed || savingSeo ? 0.75 : 1,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: COLORS.accent,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                })}
              >
                {savingSeo ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>
                  {savingSeo ? "Guardando…" : "Guardar SEO"}
                </Text>
              </Pressable>
            </View>

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
                Los cambios se aplican al momento, sin esperar a un nuevo despliegue: Google los
                recogerá la próxima vez que visite la tienda (normalmente, en pocos días).
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
