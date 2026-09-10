// components/SocialLinks.tsx
/**
 * Qué hace: bloque "Síguenos" — los logos de las redes/plataformas de la
 * tienda (Instagram, TikTok, WhatsApp, YouTube, Gmail, Apple Maps, Facebook
 * Marketplace, Wallapop, Vinted), centrados y en fila, cada uno abriendo el
 * enlace real al tocarlo. Se pinta solo, sin tocar pantalla por pantalla, en
 * tres sitios: el pie de página de Inicio, Perfil y la Cesta. Acepta
 * `titleColor` para que el título se lea bien tanto en fondo claro (Perfil,
 * Cesta) como en el pie de página oscuro de Inicio (allí se monta con
 * titleColor="#FFFFFF").
 *
 * Cómo funciona:
 * - Lee la tabla `social_links` de Supabase (9 filas fijas, una por
 *   plataforma, ver migraciones create_social_links y
 *   social_links_add_platforms_and_title): cada fila tiene su enlace (url) y
 *   si está activada (enabled). Aquí solo se pintan las que Daniel ha
 *   activado Y tienen un enlace guardado — así el footer nunca muestra un
 *   icono roto ni una red que todavía no ha rellenado.
 * - El título ("Síguenos" por defecto) es editable por Daniel desde
 *   app/admin/redes-sociales.tsx y vive en site_settings.social_links_title
 *   — se lee de ahí salvo que quien monte el componente pase su propio
 *   `title` (o `title={null}` para no mostrar ninguno).
 * - Si no hay ninguna red activa todavía, este componente no pinta NADA
 *   (return null) — así no aparece un hueco vacío con el título sin iconos
 *   debajo mientras Daniel las va configurando.
 * - Rellenar/activar cada red, y el título, se hace desde
 *   app/admin/redes-sociales.tsx — este componente solo LEE, nunca escribe.
 * - Cada red construye su enlace real a partir de lo que Daniel escribió,
 *   para que valga tanto pegar la URL completa como escribir solo lo básico:
 *   - Instagram / TikTok / YouTube / Facebook Marketplace / Wallapop /
 *     Vinted: si no empieza por "http", se le añade "https://" delante.
 *   - WhatsApp: si empieza por "http" se usa tal cual (vale un enlace de
 *     canal/comunidad de WhatsApp); si no, se trata como número de teléfono
 *     y se arma un enlace "https://wa.me/<número>".
 *   - Gmail: si empieza por "http" o "mailto:" se usa tal cual; si no (p. ej.
 *     solo "tienda@gmail.com"), se arma un enlace "mailto:".
 *   - Apple Maps: si empieza por "http" se usa tal cual (pegar el enlace que
 *     da Apple Maps al compartir la ubicación es lo más fiable); si no, se
 *     trata como una dirección/nombre de sitio y se arma
 *     "https://maps.apple.com/?q=<dirección>".
 *
 * Abrir la app o la web al tocar un icono: no hace falta ningún truco
 * adicional aquí. Instagram, Facebook, YouTube, WhatsApp, Wallapop, Vinted y
 * Apple Maps ya registran sus propios dominios como "enlaces universales" —
 * una función del propio sistema operativo (iOS/Android): si el usuario
 * tiene la app instalada, un enlace normal a esa web la abre directamente en
 * la app; si no la tiene, abre la web tal cual, donde esas mismas empresas
 * suelen mostrar su propio aviso para descargar la app. Es el mismo
 * mecanismo con el que ya funciona wa.me. Por eso basta con abrir siempre el
 * enlace real — no hace falta duplicar esa lógica aquí, y un truco casero
 * (URL con esquema propio + temporizador) sería menos fiable que dejar que
 * el sistema operativo lo resuelva solo.
 *
 * Eso sí — EN QUÉ NAVEGADOR se abre ese enlace real es otra cosa: por
 * defecto se abriría en el mismo navegador que ya está mostrando la tienda
 * (Safari en iPhone). Daniel pidió que se abra en Chrome cuando esté
 * instalado — ver lib/openExternalLink.ts, que sí usa el truco documentado
 * por Google para ESE caso concreto (a diferencia de "abrir la app de
 * Instagram", aquí sí hay un esquema oficial y estable que probar).
 *
 * Iconos: Instagram/WhatsApp/YouTube/Facebook/Apple usan Ionicons (ya la usa
 * toda la app). TikTok usa MaterialIcons y Gmail usa MaterialCommunityIcons
 * — ambas familias, igual que Ionicons, cargan su fuente solas al montarse
 * (no hace falta nada especial para que se vean bien), y sus fuentes se
 * precargan también en app/_layout.tsx para que no parpadeen invisibles el
 * primer instante. Wallapop y Vinted no tienen un logo en ninguna fuente de
 * iconos incluida en el proyecto, así que se pintan como una insignia con su
 * inicial ("W" / "V") sobre el color de marca — un compromiso honesto,
 * explicado a Daniel, hasta que exista un icono real que añadir. Apple Maps
 * tampoco tiene un logo de "mapa" propio en ninguna fuente incluida, así que
 * se usa el logo de Apple (Ionicons "logo-apple"): identifica la marca
 * aunque no sea el icono exacto de la app Mapas.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente para leer `social_links` y
 *   `site_settings.social_links_title` (ya cuenta como petición
 *   "trackeada": la barra "Pensando" se enciende sola mientras carga, ver
 *   lib/loadingBus.ts).
 * - app/admin/redes-sociales.tsx → donde Daniel añade/activa/quita cada red
 *   y edita el título de este bloque.
 * - app/(tabs)/index.tsx (pie de página), app/(tabs)/perfil.tsx,
 *   app/(tabs)/cesta.tsx → los tres sitios donde se monta.
 * - app/_layout.tsx → precarga las fuentes de MaterialIcons y
 *   MaterialCommunityIcons junto a la de Ionicons.
 */
import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { openExternalLink } from "../lib/openExternalLink";

export type SocialPlatform =
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

export const SOCIAL_ICONS: Record<
  SocialPlatform,
  { render: (color: string, size: number) => React.ReactNode; color: string; bg: string }
> = {
  instagram: {
    render: (color, size) => <Ionicons name="logo-instagram" size={size} color={color} />,
    color: "#C1327A",
    bg: "#FBEAF3",
  },
  tiktok: {
    render: (color, size) => <MaterialIcons name="tiktok" size={size} color={color} />,
    color: "#0B2138",
    bg: "#EAF6FD",
  },
  whatsapp: {
    render: (color, size) => <Ionicons name="logo-whatsapp" size={size} color={color} />,
    color: "#1F9E52",
    bg: "#E3F7EB",
  },
  youtube: {
    render: (color, size) => <Ionicons name="logo-youtube" size={size} color={color} />,
    color: "#D6291D",
    bg: "#FCEAE9",
  },
  gmail: {
    render: (color, size) => <MaterialCommunityIcons name="gmail" size={size} color={color} />,
    color: "#C5382B",
    bg: "#FCEAE9",
  },
  apple_maps: {
    // No hay un icono de "Mapas de Apple" en ninguna fuente incluida en el
    // proyecto — se usa el logo de Apple, que sí existe en Ionicons.
    render: (color, size) => <Ionicons name="logo-apple" size={size} color={color} />,
    color: "#0B2138",
    bg: "#EEF2F5",
  },
  facebook_marketplace: {
    // Tampoco existe un icono específico de "Marketplace" — se usa el logo
    // de Facebook.
    render: (color, size) => <Ionicons name="logo-facebook" size={size} color={color} />,
    color: "#1461D2",
    bg: "#EAF1FD",
  },
  wallapop: {
    // Sin logo propio disponible: insignia con la inicial sobre su color de
    // marca.
    render: (color, size) => (
      <Text style={{ color, fontWeight: "900", fontSize: Math.round(size * 0.62) }}>W</Text>
    ),
    color: "#00C298",
    bg: "#E1FBF3",
  },
  vinted: {
    render: (color, size) => (
      <Text style={{ color, fontWeight: "900", fontSize: Math.round(size * 0.62) }}>V</Text>
    ),
    color: "#09B1BA",
    bg: "#E1F7F9",
  },
};

export function buildSocialHref(platform: SocialPlatform, raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  if (platform === "gmail") {
    if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value)) return value;
    if (value.includes("@")) return `mailto:${value}`;
    return null;
  }

  if (platform === "whatsapp") {
    if (/^https?:\/\//i.test(value)) return value;
    const digits = value.replace(/[^\d]/g, "");
    return digits ? `https://wa.me/${digits}` : null;
  }

  if (platform === "apple_maps") {
    if (/^https?:\/\//i.test(value)) return value;
    return `https://maps.apple.com/?q=${encodeURIComponent(value)}`;
  }

  // instagram / tiktok / youtube / facebook_marketplace / wallapop / vinted
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function openSocialLink(href: string) {
  try {
    // Síncrono a propósito: el truco de "abrir en Chrome" de
    // openExternalLink() cambia la ubicación de la pestaña, y eso solo
    // funciona de forma fiable si ocurre dentro del mismo toque del usuario
    // (sin ningún `await` de por medio que lo retrase).
    openExternalLink(href);
  } catch {
    // Silencioso: si el enlace no se puede abrir (dato mal escrito por el
    // admin, o el dispositivo no tiene con qué abrirlo), no rompemos nada.
  }
}

export default function SocialLinks({
  title,
  titleColor = "#0B2138",
}: {
  /**
   * Si no se pasa (undefined), se usa el título guardado en
   * site_settings.social_links_title (editable desde
   * app/admin/redes-sociales.tsx). Pasa `null` para no mostrar título.
   */
  title?: string | null;
  /** Color del texto del título — cambia a blanco en el pie de página oscuro. */
  titleColor?: string;
}) {
  const [rows, setRows] = useState<SocialLinkRow[]>([]);
  const [dbTitle, setDbTitle] = useState("Síguenos");

  useEffect(() => {
    let alive = true;

    async function loadSocialLinks() {
      try {
        const [linksRes, settingsRes] = await Promise.all([
          supabase
            .from("social_links")
            .select("platform,label,url,enabled,sort_order")
            .order("sort_order", { ascending: true }),
          supabase.from("site_settings").select("social_links_title").eq("id", 1).maybeSingle(),
        ]);

        if (!alive) return;

        if (!linksRes.error) {
          setRows(Array.isArray(linksRes.data) ? (linksRes.data as SocialLinkRow[]) : []);
        }
        const fetchedTitle = settingsRes.data?.social_links_title;
        if (!settingsRes.error && typeof fetchedTitle === "string" && fetchedTitle.trim()) {
          setDbTitle(fetchedTitle.trim());
        }
      } catch {
        // Silencioso: si falla, el bloque simplemente no aparece (return
        // null más abajo) — nunca debe romper la pantalla donde vive.
      }
    }

    loadSocialLinks();

    return () => {
      alive = false;
    };
  }, []);

  const visible = rows
    .filter((r) => r.enabled)
    .map((r) => ({ ...r, href: r.url ? buildSocialHref(r.platform, r.url) : null }))
    .filter((r) => !!r.href);

  if (visible.length === 0) return null;

  const shownTitle = title === null ? null : title !== undefined ? title : dbTitle;

  return (
    <View style={{ alignItems: "center", gap: 12 }}>
      {shownTitle ? (
        <Text style={{ color: titleColor, fontWeight: "900", fontSize: 13, letterSpacing: 0.3 }}>
          {shownTitle.toUpperCase()}
        </Text>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 12,
        }}
      >
        {visible.map((r) => {
          const meta = SOCIAL_ICONS[r.platform];
          if (!meta) return null;
          return (
            <Pressable
              key={r.platform}
              onPress={() => openSocialLink(r.href as string)}
              accessibilityRole="link"
              accessibilityLabel={r.label}
              style={({ pressed }) => ({
                width: 46,
                height: 46,
                borderRadius: 23,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: meta.bg,
                borderWidth: 1,
                borderColor: "#E3EAF2",
                opacity: pressed ? 0.82 : 1,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              })}
            >
              {meta.render(meta.color, 22)}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
