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
 * - TikTok e Instagram llevan además «Seguidores»: el número que se ve junto
 *   al logo de Inicio (components/SocialLinks.tsx, RedJuntoAlLogo) y la fecha
 *   en que se escribió (columnas seguidores y seguidores_actualizado,
 *   migración 20261101100000; sin ella el campo avisa y no se guarda, y en
 *   Inicio sale «Síguenos»). Arriba, cuántas veces se tocan desde Inicio
 *   (30 días, analítica propia «redes_inicio»).
 * - «Reseñas en los canales de venta»: cuántas reseñas lleva la tienda en
 *   Wallapop, Vinted…; salen con una estrella debajo del logo de Inicio
 *   (ResenasCanales). Columnas site_settings.resenas_canales y
 *   resenas_canales_actualizado (migración 20261101120000; sin ella el campo
 *   avisa y no se guarda, y en Inicio no sale). Vacío o 0: no sale.
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
 * Rediseño PANRED5 (tanda 5, 2026-11-16; components/admin/PanelUI.tsx): arriba, las cifras de estado (Activas, Sin
 * enlace, Toques desde Inicio y Visitas distintas, 30 días) y debajo los bloques con su título: «Título del bloque»,
 * «Reseñas en los canales de venta» y «Redes y enlaces» (cada red en su bloque con su etiqueta Activa / Desactivada /
 * Falta el enlace, las flechas de orden y el interruptor; sus campos siempre a la vista). «Guardar cambios» al final.
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
 * - Tamaños del móvil (grupo 5, 2026-11-13; constants/theme.ts): ningún texto de menos de 13 px, grises
 *   desde COLORES_TEXTO.secundario, todo lo que se toca (también las flechas de orden) de 44 px
 *   separado 8 y los campos de 16 px y 48 de alto.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { AdminHeader, AdminLoading, AdminNotice } from "../../lib/admin/products.components";
import { formatearSeguidores } from "../../components/SocialLinks";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/theme";
import { BloqueFormulario, Cifra, Detalle, EtiquetaColor, FilaCifras, Seccion } from "../../components/admin/PanelUI";

// "on-drag" en web cierra el teclado con CUALQUIER desplazamiento, incluido el que hace
// scrollFieldIntoView (más abajo) al enfocar un campo: el campo se cerraba solo y "no dejaba
// escribir". Por eso solo se usa en nativo.
const CIERRE_TECLADO: "none" | "on-drag" = Platform.OS === "web" ? "none" : "on-drag";

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
  // Seguidores (solo TikTok e Instagram, que salen junto al logo de Inicio) y cuándo se escribieron.
  seguidores?: number | null;
  seguidores_actualizado?: string | null;
};

// Las redes que salen junto al logo de Inicio con sus seguidores (components/SocialLinks.tsx, RedJuntoAlLogo).
const REDES_CON_SEGUIDORES: SocialPlatform[] = ["tiktok", "instagram"];

function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  // Los campos, en blanco sobre el fondo del bloque.
  cardSoft: "#FFFFFF",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: COLORES_TEXTO.secundario,
  muted2: COLORES_TEXTO.secundario,
  accent: "#1EA7E8",
  // Botón principal: el mismo azul que "Comprar"/"Confirmar pedido" de la tienda.
  accentDark: "#1EA7E8",
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
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [rows, setRows] = useState<SocialLinkRow[]>([]);
  const [followTitle, setFollowTitle] = useState("Síguenos");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  // ¿Existe ya la columna de seguidores (migración 20261101100000)? Sin ella, el campo se ve pero no se guarda.
  const [conSeguidores, setConSeguidores] = useState(true);
  // Redes cuyo número de seguidores se ha cambiado (para apuntar la fecha al guardar).
  const [seguidoresCambiados, setSeguidoresCambiados] = useState<Set<SocialPlatform>>(new Set());
  // Reseñas en los canales de venta (debajo del logo de Inicio): el número, cuándo se escribió, si existe ya su columna
  // (migración 20261101120000) y si se ha cambiado (para apuntar la fecha al guardar).
  const [resenas, setResenas] = useState<number | null>(null);
  const [resenasActualizado, setResenasActualizado] = useState<string | null>(null);
  const [conResenas, setConResenas] = useState(true);
  const [resenasCambiadas, setResenasCambiadas] = useState(false);
  // Toques en TikTok e Instagram junto al logo de Inicio (analítica propia, 30 días; sin quien la rechazó).
  const [toquesInicio, setToquesInicio] = useState<{ tiktok: number; instagram: number; personas: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      // «*»: sin la migración, pedir «seguidores» por su nombre daba un error 400; así una sola petición que no falla, y
      // si las filas no traen «seguidores», el campo avisa de que aún no se guarda.
      const [linksRes, settingsRes, toquesRes] = await Promise.all([
        supabase.from("social_links").select("*").order("sort_order", { ascending: true }),
        // «*» también aquí: sin la migración de las reseñas no hay error 400; si la fila no las trae, el campo avisa.
        supabase.from("site_settings").select("*").eq("id", 1).maybeSingle(),
        supabase
          .from("analytics_events")
          .select("session_id,metadata")
          .eq("event_name", "redes_inicio")
          .gte("created_at", desde)
          .limit(5000),
      ]);
      if (linksRes.error) throw linksRes.error;
      const filasRedes = Array.isArray(linksRes.data) ? (linksRes.data as SocialLinkRow[]) : [];
      setRows(filasRedes);
      setConSeguidores(filasRedes.length > 0 && filasRedes.every((f) => "seguidores" in f));
      setSeguidoresCambiados(new Set());

      if (!settingsRes.error && settingsRes.data?.social_links_title) {
        setFollowTitle(settingsRes.data.social_links_title);
      }
      const ajustes = (settingsRes.error ? null : settingsRes.data) as
        | { resenas_canales?: number | null; resenas_canales_actualizado?: string | null }
        | null;
      setConResenas(!!ajustes && "resenas_canales" in ajustes);
      setResenas(ajustes?.resenas_canales ?? null);
      setResenasActualizado(ajustes?.resenas_canales_actualizado ?? null);
      setResenasCambiadas(false);

      if (toquesRes.error) {
        setToquesInicio(null);
      } else {
        const filas = (toquesRes.data ?? []) as { session_id: string | null; metadata: { red?: string } | null }[];
        setToquesInicio({
          tiktok: filas.filter((f) => f.metadata?.red === "tiktok").length,
          instagram: filas.filter((f) => f.metadata?.red === "instagram").length,
          personas: new Set(filas.map((f) => f.session_id).filter(Boolean)).size,
        });
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

      const ahora = new Date().toISOString();
      const results = await Promise.all([
        ...rows.map((r, index) =>
          supabase
            .from("social_links")
            .update({
              url: r.url?.trim() || null,
              enabled: r.enabled,
              sort_order: index + 1,
              // Los seguidores, solo si ya existe su columna y solo los de TikTok e Instagram; la fecha, si cambiaron.
              ...(conSeguidores && REDES_CON_SEGUIDORES.includes(r.platform)
                ? {
                    seguidores: r.seguidores ?? null,
                    ...(seguidoresCambiados.has(r.platform) ? { seguidores_actualizado: r.seguidores != null ? ahora : null } : {}),
                  }
                : {}),
            })
            .eq("platform", r.platform)
        ),
        supabase
          .from("site_settings")
          .update({
            social_links_title: cleanTitle,
            // Las reseñas, solo si ya existe su columna; la fecha, si cambiaron.
            ...(conResenas
              ? { resenas_canales: resenas, ...(resenasCambiadas ? { resenas_canales_actualizado: resenas != null ? ahora : null } : {}) }
              : {}),
          })
          .eq("id", 1),
      ]);

      const firstError = results.find((r) => r.error)?.error;
      if (firstError) throw firstError;

      setFollowTitle(cleanTitle);
      setRows((prev) =>
        prev.map((r, index) => ({
          ...r,
          sort_order: index + 1,
          ...(conSeguidores && seguidoresCambiados.has(r.platform) ? { seguidores_actualizado: r.seguidores != null ? ahora : null } : {}),
        }))
      );
      setSeguidoresCambiados(new Set());
      if (conResenas && resenasCambiadas) setResenasActualizado(resenas != null ? ahora : null);
      setResenasCambiadas(false);
      setMsg({
        type: "ok",
        text: "Guardado. Ya se ve así junto al logo de Inicio (TikTok, Instagram y las reseñas), en el pie de página, Perfil, la Cesta y Blue IA.",
      });
    } catch (e: any) {
      console.error("Error guardando redes sociales:", e);
      setMsg({ type: "error", text: "No se ha podido guardar. Inténtalo de nuevo." });
    } finally {
      setSaving(false);
    }
  }

  // Cifras de estado de arriba.
  const activas = rows.filter((r) => r.enabled).length;
  const sinEnlace = rows.filter((r) => r.enabled && !r.url?.trim()).length;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado), igual en todo el panel. */}
      <AdminHeader title="Redes sociales" isMobile={isMobile} />

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
            {/* 1) Cifras de estado: redes activas, activas sin enlace y toques desde Inicio (30 días, analítica propia). */}
            <FilaCifras nativeID="redes-cifras">
              <Cifra nativeID="redes-cifra-activas" valor={`${activas} / ${rows.length}`} etiqueta="Activas" icono="share-social-outline" ancho={isMobile ? "45%" : 0} />
              <Cifra nativeID="redes-cifra-sin-enlace" valor={String(sinEnlace)} etiqueta="Activas sin enlace" icono="link-outline" ancho={isMobile ? "45%" : 0} alerta={sinEnlace > 0} />
              <Cifra
                nativeID="redes-cifra-toques"
                valor={toquesInicio ? String(toquesInicio.tiktok + toquesInicio.instagram) : "-"}
                etiqueta="Toques desde Inicio"
                icono="hand-left-outline"
                ancho={isMobile ? "45%" : 0}
              />
              <Cifra nativeID="redes-cifra-visitas" valor={toquesInicio ? String(toquesInicio.personas) : "-"} etiqueta="Visitas distintas" icono="people-outline" ancho={isMobile ? "45%" : 0} />
            </FilaCifras>

            <View style={{ gap: 6 }}>
              {toquesInicio ? (
                <Text nativeID="redes-toques-inicio" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                  Desde Inicio (30 días): {toquesInicio.tiktok} {toquesInicio.tiktok === 1 ? "toque" : "toques"} en TikTok y{" "}
                  {toquesInicio.instagram} en Instagram · {toquesInicio.personas}{" "}
                  {toquesInicio.personas === 1 ? "visita distinta" : "visitas distintas"}
                </Text>
              ) : null}
              <Detalle>
                Los enlaces que se ven en el pie de página, Perfil y la Cesta (TikTok e Instagram, también junto al logo de Inicio con
                sus seguidores, y debajo del logo, tus reseñas) y que Blue IA recomienda seguir.
              </Detalle>
            </View>

            {!!loadErr && <AdminNotice tone="danger" text={loadErr} />}

            <View style={{ flexDirection: isMobile ? "column" : "row", alignItems: "flex-start", gap: isMobile ? 18 : 16 }}>
            <View style={{ width: isMobile ? "100%" : undefined, flex: isMobile ? undefined : 1, minWidth: 0 }}>
            <BloqueFormulario nativeID="redes-titulo" icono="text-outline" titulo="Título del bloque">
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
                  fontSize: CAMPO.letra,
                  minHeight: CAMPO.alto,
                }}
              />
              <Text style={{ color: COLORS.muted2, fontSize: TAMANOS.minimo, lineHeight: 18 }}>
                El texto que aparece encima de los iconos en el pie de página, Perfil y la Cesta.
              </Text>
            </BloqueFormulario>
            </View>

            {/* Reseñas en los canales de venta: salen con una estrella debajo del logo de Inicio (las escribe Daniel). */}
            <View style={{ width: isMobile ? "100%" : undefined, flex: isMobile ? undefined : 1, minWidth: 0 }}>
            <BloqueFormulario nativeID="redes-resenas" icono="star-outline" titulo="Reseñas en los canales de venta">
              <TextInput
                accessibilityLabel="Reseñas en los canales de venta"
                value={resenas != null ? String(resenas) : ""}
                onChangeText={(text) => {
                  const cifras = text.replace(/\D/g, "").slice(0, 10);
                  setResenas(cifras ? Math.min(2000000000, Number(cifras)) : null);
                  setResenasCambiadas(true);
                  setMsg(null);
                }}
                onFocus={scrollFieldIntoView}
                placeholder="Por ejemplo, 350"
                placeholderTextColor="rgba(11,33,56,0.40)"
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={13}
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: COLORS.text,
                  backgroundColor: COLORS.cardSoft,
                  fontSize: CAMPO.letra,
                  minHeight: CAMPO.alto,
                }}
              />
              <Text style={{ color: COLORS.muted2, fontSize: TAMANOS.minimo, lineHeight: 18 }}>
                {!conResenas
                  ? "Se podrá guardar en cuanto se active su parte en la base de datos; mientras, en Inicio no sale."
                  : resenas != null && resenas > 0
                    ? `Debajo del logo de Inicio: «${formatearSeguidores(resenas)} ${resenas === 1 ? "reseña" : "reseñas"} en todos nuestros canales de venta»${
                        fechaCorta(resenasActualizado) ? ` · escrito el ${fechaCorta(resenasActualizado)}` : ""
                      }. Déjalo vacío para que no salga.`
                    : "Todas las reseñas que llevas en Wallapop, Vinted, Facebook Marketplace… Vacío: en Inicio no sale."}
              </Text>
            </BloqueFormulario>
            </View>
            </View>

            {/* 2) Cada red en su bloque, con sus campos siempre a la vista. */}
            <Seccion nativeID="redes-lista" icon="share-social-outline" title="Redes y enlaces" extra={`${activas} de ${rows.length} activas`}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {rows.map((r, index) => {
              const meta = PLATFORM_META[r.platform];
              if (!meta) return null;
              const faltaEnlace = r.enabled && !r.url?.trim();
              return (
                <View
                  key={r.platform}
                  nativeID={`red-${r.platform}`}
                  style={{
                    flexGrow: 1,
                    flexShrink: 1,
                    flexBasis: isMobile ? "100%" : "45%",
                    minWidth: 0,
                    borderRadius: 16,
                    backgroundColor: COLORS.card,
                    padding: 12,
                    gap: 10,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {/* Solo el icono de la red, sin burbuja (dueño, 2026-11-04). */}
                    <View style={{ width: 28, alignItems: "center", justifyContent: "center" }}>{meta.icon(COLORS.accentDark, 22)}</View>
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>{r.label}</Text>
                      <EtiquetaColor
                        nativeID={`red-estado-${r.platform}`}
                        texto={faltaEnlace ? "Falta el enlace" : r.enabled ? "Activa" : "Desactivada"}
                        tono={faltaEnlace ? "rojo" : r.enabled ? "verde" : "gris"}
                      />
                    </View>

                    {/* Orden: sube o baja esta tarjeta respecto a las demás —
                        el número real se recalcula al guardar. */}
                    <View style={{ flexDirection: "row", gap: TACTIL.separacion }}>
                      <Pressable
                        onPress={() => moveRow(r.platform, -1)}
                        disabled={index === 0}
                        accessibilityRole="button"
                        accessibilityLabel={`Subir ${r.label}`}
                        hitSlop={6}
                        style={({ pressed }) => ({
                          width: TACTIL.minimo,
                          height: TACTIL.minimo,
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: index === 0 ? 0.3 : pressed ? 0.6 : 1,
                        })}
                      >
                        <Ionicons name="chevron-up" size={20} color={COLORS.text} />
                      </Pressable>
                      <Pressable
                        onPress={() => moveRow(r.platform, 1)}
                        disabled={index === rows.length - 1}
                        accessibilityRole="button"
                        accessibilityLabel={`Bajar ${r.label}`}
                        hitSlop={6}
                        style={({ pressed }) => ({
                          width: TACTIL.minimo,
                          height: TACTIL.minimo,
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: index === rows.length - 1 ? 0.3 : pressed ? 0.6 : 1,
                        })}
                      >
                        <Ionicons name="chevron-down" size={20} color={COLORS.text} />
                      </Pressable>
                    </View>

                    <Switch
                      value={r.enabled}
                      accessibilityLabel={r.enabled ? `Desactivar ${r.label}` : `Activar ${r.label}`}
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
                      fontSize: CAMPO.letra,
                      minHeight: CAMPO.alto,
                    }}
                  />
                  <Text style={{ color: COLORS.muted2, fontSize: TAMANOS.minimo, lineHeight: 18 }}>{meta.hint}</Text>

                  {/* TikTok e Instagram: sus seguidores salen junto al logo de Inicio (los escribe Daniel; nunca se inventan). */}
                  {REDES_CON_SEGUIDORES.includes(r.platform) ? (
                    <View style={{ gap: 6, marginTop: 4 }}>
                      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>Seguidores (junto al logo de Inicio)</Text>
                      <TextInput
                        accessibilityLabel={`Seguidores de ${r.label}`}
                        value={r.seguidores != null ? String(r.seguidores) : ""}
                        onChangeText={(text) => {
                          const cifras = text.replace(/\D/g, "").slice(0, 10);
                          updateRow(r.platform, { seguidores: cifras ? Math.min(2000000000, Number(cifras)) : null });
                          setSeguidoresCambiados((prev) => new Set(prev).add(r.platform));
                        }}
                        onFocus={scrollFieldIntoView}
                        placeholder="Por ejemplo, 1250"
                        placeholderTextColor="rgba(11,33,56,0.40)"
                        keyboardType="number-pad"
                        inputMode="numeric"
                        maxLength={13}
                        style={{
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          color: COLORS.text,
                          backgroundColor: COLORS.cardSoft,
                          fontSize: CAMPO.letra,
                          minHeight: CAMPO.alto,
                        }}
                      />
                      <Text style={{ color: COLORS.muted2, fontSize: TAMANOS.minimo, lineHeight: 18 }}>
                        {!conSeguidores
                          ? "Se podrá guardar en cuanto se active su parte en la base de datos; mientras, en Inicio sale «Síguenos»."
                          : r.seguidores != null
                            ? `En Inicio: ${formatearSeguidores(r.seguidores)} ${r.seguidores === 1 ? "seguidor" : "seguidores"}${
                                fechaCorta(r.seguidores_actualizado) ? ` · escrito el ${fechaCorta(r.seguidores_actualizado)}` : ""
                              }. Déjalo vacío para que salga «Síguenos».`
                            : "Vacío: en Inicio sale «Síguenos»."}
                      </Text>
                    </View>
                  ) : null}

                  {faltaEnlace ? (
                    <Text style={{ color: COLORS.danger, fontSize: TAMANOS.minimo, fontWeight: "800" }}>
                      Está activada pero no tiene enlace todavía: no aparecerá hasta que lo rellenes.
                    </Text>
                  ) : null}
                </View>
              );
            })}
            </View>
            </Seccion>

            {!!msg && <AdminNotice tone={msg.type === "ok" ? "success" : "danger"} text={msg.text} />}

            <Pressable
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
              style={({ pressed }) => ({
                opacity: pressed || saving ? 0.75 : 1,
                minHeight: CAMPO.alto,
                paddingHorizontal: 20,
                borderRadius: 999,
                backgroundColor: COLORS.accentDark,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
                width: "100%",
                maxWidth: 420,
                alignSelf: isMobile ? "center" : "flex-start",
              })}
            >
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </Text>
            </Pressable>

            <Detalle>
              Los cambios se aplican al momento, sin esperar a un nuevo despliegue: en cuanto guardes, el icono aparece o desaparece en
              el pie de página, Perfil y la Cesta, y Blue IA ya lo sabe. Puedes activar las 9 redes a la vez sin problema: se reparten
              solas en varias filas.
            </Detalle>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
