// components/PromoBanner.tsx
/**
 * Qué hace: franja promocional superior (antes texto fijo "Te compramos tu
 * consola en menos de 24h") con el botón "Vender Ya". Ahora es un rotador de
 * "Noticias Flash": lee hasta 5 mensajes activos de la tabla Supabase
 * "flash_news" y los va mostrando uno detrás de otro con un fundido suave,
 * cada uno con su propio color y sus propios segundos en pantalla — todo
 * editable desde el panel de administración (app/admin/flash-news.tsx), sin
 * tener que tocar código para cambiar el mensaje.
 *
 * Cómo funciona:
 * - fetchFlashNewsSafe() carga las filas is_active=true de "flash_news"
 *   ordenadas por sort_order; si la tabla no existe todavía, está vacía o
 *   falla la carga (sin conexión, RLS, etc.), se usa un único mensaje de
 *   emergencia ("Te compramos tu electrónica hoy mismo") para que la franja
 *   nunca se quede vacía ni rompa la pantalla.
 * - Con más de una noticia activa, un temporizador por noticia (su propio
 *   display_seconds) dispara un fundido de salida/entrada (Animated,
 *   useNativeDriver) y avanza a la siguiente, en bucle.
 * - color_hex de cada noticia tiñe el fondo/borde de la franja y el icono de
 *   rayo (hexToRgba calcula versiones translúcidas); el texto se mantiene
 *   siempre en el azul marino de marca para que sea legible con cualquier
 *   color elegido.
 * - Sigue siendo un componente de presentación sin lógica de negocio propia:
 *   recibe onPressVender y cada pantalla decide qué hacer (en la práctica,
 *   abrir su propio VenderAhoraModal con un estado local "sellModalOpen").
 *   Calcula su propio responsive (isMobile) con useWindowDimensions.
 *
 * Conectado con:
 * - app/(tabs)/index.tsx → la usa dentro de su propio Animated.View que la
 *   oculta/muestra al hacer scroll (esa animación de ocultar es solo de
 *   Inicio; aquí no hace falta reimplementarla).
 * - app/(tabs)/perfil.tsx, cesta.tsx, chat-global.tsx, blue-ia.tsx → la
 *   muestran fija arriba del todo, siempre visible.
 * - components/VenderAhoraModal.tsx → el formulario "Vender ahora" que cada
 *   pantalla abre desde onPressVender.
 * - app/admin/flash-news.tsx → editor de administración para estas noticias
 *   (añadir hasta 5, reordenar, activar/desactivar, elegir color y segundos).
 * - lib/supabase.ts → cliente de Supabase para leer "flash_news".
 * - lib/flashBannerBus.ts → aquí se mide (onLayout) y se publica el alto
 *   real de esta franja, para que components/GlobalLoadingBar.tsx pueda
 *   pegarse justo debajo sin adivinar un número de píxeles fijo.
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../lib/supabase";
import { setFlashBannerHeight } from "../lib/flashBannerBus";

const COLORS = {
  text: "#0B2138",
};

const FALLBACK_COLOR = "#FFB200";

type FlashNewsItem = {
  id: string;
  message: string;
  colorHex: string;
  displaySeconds: number;
};

// Mensaje de emergencia: se usa si "flash_news" no existe todavía, está
// vacía o falla la carga, para que la franja nunca desaparezca del todo.
const FALLBACK_ITEMS: FlashNewsItem[] = [
  {
    id: "fallback",
    message: "Te compramos tu electrónica hoy mismo",
    colorHex: FALLBACK_COLOR,
    displaySeconds: 6,
  },
];

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;

  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);

  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return hexToRgba(FALLBACK_COLOR, alpha);
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

async function fetchFlashNewsSafe(): Promise<FlashNewsItem[]> {
  try {
    const { data, error } = await supabase
      .from("flash_news")
      .select("id,message,color_hex,display_seconds,sort_order,is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(5);

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];

    const items: FlashNewsItem[] = rows
      .map((row): FlashNewsItem | null => {
        const message = String((row as any)?.message ?? "").trim();
        if (!message) return null;

        const rawColor = String((row as any)?.color_hex ?? "").trim();
        const colorHex = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : FALLBACK_COLOR;

        const rawSeconds = Number((row as any)?.display_seconds);
        const displaySeconds =
          Number.isFinite(rawSeconds) && rawSeconds > 0 ? rawSeconds : 6;

        return {
          id: String((row as any)?.id ?? message),
          message,
          colorHex,
          displaySeconds,
        };
      })
      .filter((item): item is FlashNewsItem => item !== null);

    return items.length > 0 ? items : FALLBACK_ITEMS;
  } catch {
    return FALLBACK_ITEMS;
  }
}

export default function PromoBanner({
  onPressVender,
}: {
  onPressVender: () => void;
}) {
  const { width } = useWindowDimensions();
  const widthSafe = width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;

  const [items, setItems] = useState<FlashNewsItem[]>(FALLBACK_ITEMS);
  const [activeIndex, setActiveIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let alive = true;

    fetchFlashNewsSafe().then((loaded) => {
      if (!alive) return;
      setItems(loaded);
      setActiveIndex(0);
    });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (items.length <= 1) return undefined;

    const current = items[activeIndex % items.length];
    const seconds = current?.displaySeconds ?? 6;

    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        setActiveIndex((i) => (i + 1) % items.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }).start();
      });
    }, Math.max(2, seconds) * 1000);

    return () => clearTimeout(timer);
  }, [items, activeIndex, fadeAnim]);

  const active = items[activeIndex % items.length] ?? FALLBACK_ITEMS[0];
  const bg = hexToRgba(active.colorHex, 0.14);
  const border = hexToRgba(active.colorHex, 0.45);
  // Antes esta franja terminaba en una línea recta (borderBottomWidth de 1px).
  // A petición de Daniel ("quiero que sea un difuminado"), esa línea dura se
  // sustituye por una tira de degradado que se pinta a continuación (fuera de
  // la caja con el color sólido, ocupando su propio espacio en el layout) y
  // se desvanece desde "bg" hasta transparente, dejando un cierre suave en
  // vez de un corte abrupto. Su altura entra en la medición de onLayout, así
  // que GlobalLoadingBar (que se pega justo debajo) sigue posicionándose bien.
  const fadeHeight = isMobile ? 14 : 20;

  function handleLayout(e: LayoutChangeEvent) {
    setFlashBannerHeight(e.nativeEvent.layout.height);
  }

  return (
    <View onLayout={handleLayout}>
      <View
        style={{
          backgroundColor: bg,
          paddingVertical: isMobile ? 7 : 10,
          paddingHorizontal: isMobile ? 16 : 24,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 920,
            alignSelf: "center",
            flexDirection: isMobile ? "column" : "row",
            alignItems: "center",
            justifyContent: "center",
            gap: isMobile ? 6 : 12,
          }}
        >
          <Animated.View
            style={{
              opacity: fadeAnim,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              flexShrink: 1,
            }}
          >
            <Ionicons name="flash-outline" size={isMobile ? 13 : 16} color={active.colorHex} />
            <Text
              numberOfLines={2}
              style={{
                color: COLORS.text,
                fontWeight: "900",
                fontSize: isMobile ? 12 : 15,
                lineHeight: isMobile ? 16 : 20,
                textAlign: "center",
              }}
            >
              {active.message}
            </Text>
          </Animated.View>

          <Pressable
            onPress={onPressVender}
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              paddingVertical: isMobile ? 6 : 8,
              paddingHorizontal: isMobile ? 11 : 14,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: border,
              backgroundColor: bg,
              flexShrink: 0,
            })}
          >
            <Text
              style={{
                color: COLORS.text,
                fontWeight: "900",
                fontSize: isMobile ? 12 : 14,
              }}
            >
              Vender Ya
            </Text>
          </Pressable>
        </View>
      </View>

      <LinearGradient
        pointerEvents="none"
        colors={[bg, "transparent"]}
        locations={[0, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ width: "100%", height: fadeHeight }}
      />
    </View>
  );
}
