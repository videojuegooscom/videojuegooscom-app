// components/SocialLinks.tsx
/**
 * Qué hace: bloque "Síguenos" — los logos de las redes sociales de la
 * tienda (Instagram, TikTok, WhatsApp, YouTube, Gmail), centrados y en fila,
 * cada uno abriendo el enlace real al tocarlo. Se pinta solo, sin tocar
 * pantalla por pantalla, en tres sitios: el pie de página de Inicio, Perfil
 * y la Cesta. Acepta `titleColor` para que el texto "SÍGUENOS" se lea bien
 * tanto en fondo claro (Perfil, Cesta) como en el pie de página oscuro de
 * Inicio (allí se monta con titleColor="#FFFFFF").
 *
 * Cómo funciona:
 * - Lee la tabla `social_links` de Supabase (5 filas fijas, una por red,
 *   ver migración create_social_links): cada fila tiene su enlace (url) y si
 *   está activada (enabled). Aquí solo se pintan las que Daniel ha activado
 *   Y tienen un enlace guardado — así el footer nunca muestra un icono roto
 *   ni una red que todavía no ha rellenado.
 * - Si no hay ninguna red activa todavía, este componente no pinta NADA
 *   (return null) — así no aparece un hueco vacío con el título "Síguenos"
 *   sin iconos debajo mientras Daniel las va configurando.
 * - Rellenar/activar cada red se hace desde app/admin/redes-sociales.tsx —
 *   este componente solo LEE, nunca escribe.
 * - Cada red construye su enlace real a partir de lo que Daniel escribió,
 *   para que valga tanto pegar la URL completa como escribir solo lo básico:
 *   - Instagram / TikTok / YouTube: si no empieza por "http", se le añade
 *     "https://" delante.
 *   - WhatsApp: si empieza por "http" se usa tal cual (vale un enlace de
 *     canal/comunidad de WhatsApp); si no, se trata como número de teléfono
 *     y se arma un enlace "https://wa.me/<número>".
 *   - Gmail: si empieza por "http" o "mailto:" se usa tal cual; si no (p. ej.
 *     solo "tienda@gmail.com"), se arma un enlace "mailto:".
 *
 * Iconos: Instagram/WhatsApp/YouTube usan Ionicons (ya la usa toda la app).
 * TikTok y Gmail no existen en Ionicons, así que usan MaterialIcons y
 * MaterialCommunityIcons respectivamente — ambas familias, igual que
 * Ionicons, cargan su fuente solas al montarse (no hace falta nada especial
 * para que se vean bien), y sus fuentes se precargan también en
 * app/_layout.tsx para que no parpadeen invisibles el primer instante,
 * exactamente igual que ya se hacía con Ionicons.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente para leer `social_links` (ya cuenta como
 *   petición "trackeada": la barra "Pensando" se enciende sola mientras
 *   carga, ver lib/loadingBus.ts).
 * - app/admin/redes-sociales.tsx → donde Daniel añade/activa/quita cada red.
 * - app/(tabs)/index.tsx (pie de página), app/(tabs)/perfil.tsx,
 *   app/(tabs)/cesta.tsx → los tres sitios donde se monta.
 * - app/_layout.tsx → precarga las fuentes de MaterialIcons y
 *   MaterialCommunityIcons junto a la de Ionicons.
 */
import React, { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

type SocialPlatform = "instagram" | "tiktok" | "whatsapp" | "youtube" | "gmail";

type SocialLinkRow = {
  platform: SocialPlatform;
  label: string;
  url: string | null;
  enabled: boolean;
  sort_order: number;
};

const ICONS: Record<
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
};

function buildHref(platform: SocialPlatform, raw: string): string | null {
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

  // instagram / tiktok / youtube
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

async function openSocialLink(href: string) {
  try {
    const canOpen = await Linking.canOpenURL(href);
    if (canOpen) {
      await Linking.openURL(href);
    }
  } catch {
    // Silencioso: si el enlace no se puede abrir (dato mal escrito por el
    // admin, o el dispositivo no tiene con qué abrirlo), no rompemos nada.
  }
}

export default function SocialLinks({
  title = "Síguenos",
  titleColor = "#0B2138",
}: {
  title?: string | null;
  /** Color del texto "SÍGUENOS" — cambia a blanco en el pie de página oscuro. */
  titleColor?: string;
}) {
  const [rows, setRows] = useState<SocialLinkRow[]>([]);

  useEffect(() => {
    let alive = true;

    async function loadSocialLinks() {
      try {
        const { data, error } = await supabase
          .from("social_links")
          .select("platform,label,url,enabled,sort_order")
          .order("sort_order", { ascending: true });

        if (!alive || error) return;
        setRows(Array.isArray(data) ? (data as SocialLinkRow[]) : []);
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
    .map((r) => ({ ...r, href: r.url ? buildHref(r.platform, r.url) : null }))
    .filter((r) => !!r.href);

  if (visible.length === 0) return null;

  return (
    <View style={{ alignItems: "center", gap: 12 }}>
      {title ? (
        <Text style={{ color: titleColor, fontWeight: "900", fontSize: 13, letterSpacing: 0.3 }}>
          {title.toUpperCase()}
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
          const meta = ICONS[r.platform];
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
