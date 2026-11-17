/**
 * Archivo: app/admin/marca-seo.tsx
 * Función: pantalla de administración «Marca y SEO», en la dirección /admin/marca-seo.
 * Para qué sirve: el administrador sube el logo de la tienda y edita el título y la descripción que Google y el navegador muestran, sin tocar código.
 * Conectado con: lib/supabase.ts (tabla site_settings y bucket de Storage site-assets), lib/admin/products.components.ts, components/SmartImage.tsx, constants/theme.ts, components/admin/PanelUI.tsx; components/SiteHead.tsx lee esos mismos datos.
 * Utilizado por: Expo Router (dirección /admin/marca-seo, protegida por app/admin/_layout.tsx); la enlaza la tarjeta «Marca y SEO» de app/admin/index.tsx.
 * Dependencias: react, react-native, @expo/vector-icons.
 * Estado: ACTIVO
 */
/**
 * Notas:
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
 * - Rediseño PANRED5 (tanda 5, 2026-11-16; components/admin/PanelUI.tsx): arriba, tres cifras de estado (Logo,
 *   Título y Descripción, con su largo frente al máximo de Google; en rojo si falta o se pasa) y debajo dos bloques con
 *   su título: «Logo de la tienda» y «Cómo aparece en Google» (vista previa, campos y «Guardar SEO»).
 *
 * Conectado con:
 * - components/SiteHead.tsx → lee esta misma tabla y aplica el título,
 *   descripción, icono y og:image en cada pantalla.
 * - app/admin/index.tsx → tarjeta "Marca y SEO" que lleva aquí.
 * - app/admin/_layout.tsx → registra esta ruta ("marca-seo") en el Stack.
 * - components/admin/PanelUI.tsx → piezas comunes; pruebas/perfil-datos.mjs (TM5 y PANRED5).
 * - Tamaños del móvil (grupo 5, 2026-11-13; constants/theme.ts): ningún texto de menos de 13 px, grises
 *   desde COLORES_TEXTO.secundario, todo lo que se toca de 44 px y los campos de 16 px y 48 de alto.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { AdminHeader, AdminLoading, AdminNotice, IconButton } from "../../lib/admin/products.components";
import SmartImage from "../../components/SmartImage";
import { CAMPO, TAMANOS } from "../../constants/theme";
import { BloqueFormulario, Cifra, Detalle, FilaCifras, PANEL } from "../../components/admin/PanelUI";

// "on-drag" en web cierra el teclado con CUALQUIER desplazamiento, también el que hace el
// propio navegador al enfocar un campo (el campo se cerraba solo): solo se usa en nativo.
const CIERRE_TECLADO: "none" | "on-drag" = Platform.OS === "web" ? "none" : "on-drag";

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

const campo = {
  borderWidth: 1,
  borderColor: PANEL.border,
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  color: PANEL.text,
  backgroundColor: PANEL.bg,
  // 16 px: con menos, Safari (iPhone) hace zoom al enfocar y la pantalla se queda ampliada y "descuadrada".
  fontSize: CAMPO.letra,
  minHeight: CAMPO.alto,
} as const;

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

// Un aviso corto de una acción (guardado o error), alineado a la izquierda dentro de su bloque.
function Mensaje({ msg }: { msg: { type: "ok" | "error"; text: string } | null }) {
  if (!msg) return null;
  return (
    <Text style={{ color: msg.type === "ok" ? PANEL.success : PANEL.danger, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>{msg.text}</Text>
  );
}

export default function AdminMarcaSeo() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const insets = useSafeAreaInsets();

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

  const largoTitulo = seoTitle.trim().length;
  const largoDesc = seoDescription.trim().length;

  return (
    <View style={{ flex: 1, backgroundColor: PANEL.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado), igual en todo el panel. */}
      <AdminHeader title="Marca y SEO" isMobile={isMobile} />

      {loading ? (
        <AdminLoading texto="Cargando…" />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={CIERRE_TECLADO}
          >
            <View style={{ width: "100%", maxWidth: 1040, gap: isMobile ? 18 : 22 }}>
              {/* 1) Cifras de estado: si hay logo y cuánto miden el título y la descripción (en rojo si faltan o se pasan). */}
              <FilaCifras nativeID="marca-cifras">
                <Cifra nativeID="marca-cifra-logo" valor={logoUrl ? "Subido" : "Falta"} etiqueta="Logo" icono="image-outline" ancho={isMobile ? "30%" : 0} alerta={!logoUrl} />
                <Cifra
                  nativeID="marca-cifra-titulo"
                  valor={`${largoTitulo}/${SEO_TITLE_MAX}`}
                  etiqueta="Título"
                  icono="text-outline"
                  ancho={isMobile ? "30%" : 0}
                  alerta={!largoTitulo || largoTitulo > SEO_TITLE_MAX}
                />
                <Cifra
                  nativeID="marca-cifra-descripcion"
                  valor={`${largoDesc}/${SEO_DESC_MAX}`}
                  etiqueta="Descripción"
                  icono="document-text-outline"
                  ancho={isMobile ? "30%" : 0}
                  alerta={!largoDesc || largoDesc > SEO_DESC_MAX}
                />
              </FilaCifras>

              <Detalle>El logo y el texto que se ven al buscar la tienda en Google, y en la pestaña del navegador.</Detalle>

              {!!loadErr && <AdminNotice tone="danger" text={loadErr} />}

              <View style={{ flexDirection: isMobile ? "column" : "row", alignItems: "flex-start", gap: isMobile ? 18 : 16 }}>
                {/* 2) Logo de la tienda. */}
                <View style={{ width: isMobile ? "100%" : undefined, flex: isMobile ? undefined : 1, minWidth: 0 }}>
                  <BloqueFormulario nativeID="marca-logo" icono="image-outline" titulo="Logo de la tienda">
                    <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                      <View
                        style={{
                          width: 96,
                          height: 96,
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: PANEL.border,
                          backgroundColor: PANEL.bg,
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                        }}
                      >
                        {logoUrl ? (
                          <SmartImage uri={logoUrl} contentFit="contain" style={{ width: "100%", height: "100%" }} />
                        ) : (
                          <Ionicons name="image-outline" size={30} color={PANEL.muted} />
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                        <Text style={{ color: PANEL.text, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>{logoUrl ? "Logo subido" : "Todavía sin logo"}</Text>
                        <Detalle>{logoUrl ? "Es el que se usa en Google y en la pestaña del navegador." : "Mientras, se usa el icono de la tienda."}</Detalle>
                      </View>
                    </View>

                    <View style={{ borderRadius: 14, backgroundColor: PANEL.accent2, padding: 12, gap: 4 }}>
                      <Text style={{ color: PANEL.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>Medidas exactas recomendadas</Text>
                      <Text style={{ color: PANEL.text, fontSize: TAMANOS.minimo, lineHeight: 18 }}>
                        Cuadrada, 512 × 512 píxeles (o 1024 × 1024 si tienes calidad de sobra). Formato JPG, PNG o WEBP, con fondo sólido
                        (evita transparencias: en algunos sitios se ven con fondo negro). Peso máximo {MAX_LOGO_SIZE_MB} MB.
                      </Text>
                      <Text style={{ color: PANEL.muted, fontSize: TAMANOS.minimo, lineHeight: 18, marginTop: 4 }}>
                        Con esa medida se ve bien tanto en el resultado de Google como en la pestaña del navegador. La tarjeta que se ve al
                        pegar el enlace en WhatsApp o Facebook no está cubierta todavía: es un paso aparte, si en algún momento lo quieres.
                      </Text>
                    </View>

                    <Mensaje msg={logoMsg} />

                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                      <Pressable
                        nativeID="marca-subir-logo"
                        onPress={handlePickLogo}
                        disabled={uploadingLogo}
                        accessibilityRole="button"
                        style={({ pressed }) => ({
                          opacity: pressed || uploadingLogo ? 0.75 : 1,
                          minHeight: CAMPO.alto,
                          paddingHorizontal: 18,
                          borderRadius: 999,
                          backgroundColor: PANEL.accent,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        })}
                      >
                        {uploadingLogo ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="cloud-upload-outline" size={16} color="#FFFFFF" />}
                        <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>{logoUrl ? "Cambiar logo" : "Subir logo"}</Text>
                      </Pressable>

                      {logoUrl ? (
                        removingLogo ? (
                          <ActivityIndicator size="small" color={PANEL.danger} />
                        ) : (
                          <IconButton icon="trash-outline" label="Quitar el logo" variant="danger" onPress={handleRemoveLogo} />
                        )
                      ) : null}
                    </View>
                  </BloqueFormulario>
                </View>

                {/* 3) SEO: título y descripción, con la vista previa del resultado de Google. */}
                <View style={{ width: isMobile ? "100%" : undefined, flex: isMobile ? undefined : 1.25, minWidth: 0 }}>
                  <BloqueFormulario nativeID="marca-google" icono="search-outline" titulo="Cómo aparece en Google">
                    <View nativeID="marca-vista-previa" style={{ borderRadius: 14, borderWidth: 1, borderColor: PANEL.border, backgroundColor: "#FFFFFF", padding: 12, gap: 3 }}>
                      <Text style={{ color: "#1a0dab", fontSize: 16, fontWeight: "600" }} numberOfLines={1}>
                        {seoTitle.trim() || "Título de la tienda"}
                      </Text>
                      <Text style={{ color: "#006621", fontSize: TAMANOS.minimo }}>videojuegoszaragoza.com</Text>
                      <Text style={{ color: "#545454", fontSize: TAMANOS.minimo, lineHeight: 17 }} numberOfLines={2}>
                        {seoDescription.trim() || "La descripción aparecerá aquí, tal y como la vería alguien buscando en Google."}
                      </Text>
                    </View>

                    <View style={{ gap: 6 }}>
                      <Text style={{ color: PANEL.text, fontWeight: "800", fontSize: 13 }}>Título (lo que se ve en azul en Google y en la pestaña del navegador)</Text>
                      <TextInput
                        value={seoTitle}
                        onChangeText={setSeoTitle}
                        placeholder="Videojuegoszaragoza.com — Compra y venta de videojuegos"
                        placeholderTextColor="rgba(11,33,56,0.40)"
                        accessibilityLabel="Título para Google"
                        maxLength={SEO_TITLE_MAX + 20}
                        style={campo}
                      />
                      <Text style={{ color: largoTitulo > SEO_TITLE_MAX ? PANEL.danger : PANEL.muted, fontSize: TAMANOS.minimo, fontWeight: "700" }}>
                        {largoTitulo}/{SEO_TITLE_MAX}: pasado este largo, Google suele recortarlo con «…»
                      </Text>
                    </View>

                    <View style={{ gap: 6 }}>
                      <Text style={{ color: PANEL.text, fontWeight: "800", fontSize: 13 }}>Descripción (el texto gris debajo, en el resultado de Google)</Text>
                      <TextInput
                        value={seoDescription}
                        onChangeText={setSeoDescription}
                        placeholder="Compra y vende videoconsolas, videojuegos y accesorios en Zaragoza. Envíos a toda España."
                        placeholderTextColor="rgba(11,33,56,0.40)"
                        accessibilityLabel="Descripción para Google"
                        multiline
                        numberOfLines={3}
                        maxLength={SEO_DESC_MAX + 40}
                        style={[campo, { minHeight: 76, textAlignVertical: "top" }]}
                      />
                      <Text style={{ color: largoDesc > SEO_DESC_MAX ? PANEL.danger : PANEL.muted, fontSize: TAMANOS.minimo, fontWeight: "700" }}>
                        {largoDesc}/{SEO_DESC_MAX}: pasado este largo, Google suele recortarla con «…»
                      </Text>
                    </View>

                    <Mensaje msg={seoMsg} />

                    <Pressable
                      nativeID="marca-guardar-seo"
                      onPress={handleSaveSeo}
                      disabled={savingSeo}
                      accessibilityRole="button"
                      style={({ pressed }) => ({
                        opacity: pressed || savingSeo ? 0.75 : 1,
                        minHeight: CAMPO.alto,
                        paddingHorizontal: 20,
                        borderRadius: 999,
                        backgroundColor: PANEL.accent,
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "row",
                        gap: 8,
                        alignSelf: isMobile ? "stretch" : "flex-start",
                      })}
                    >
                      {savingSeo ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>{savingSeo ? "Guardando…" : "Guardar SEO"}</Text>
                    </Pressable>
                  </BloqueFormulario>
                </View>
              </View>

              <Detalle>
                Los cambios se aplican al momento, sin esperar a un nuevo despliegue: Google los recogerá la próxima vez que visite la
                tienda (normalmente, en pocos días).
              </Detalle>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
