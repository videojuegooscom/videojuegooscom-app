/**
 * components/Campanita.tsx
 *
 * Qué hace: la campanita flotante de notificaciones que aparece en TODA la
 * app (se monta una sola vez en app/_layout.tsx, por encima del Stack, así
 * que sobrevive a cualquier cambio de pantalla: inicio, catálogo, producto,
 * perfil, admin...). Es un icono de verdad (Ionicons "notifications", en
 * dorado), no un emoji de texto, y solo se ve la forma de la campana — sin
 * ningún círculo ni fondo alrededor. De vez en cuando "suena" con un
 * pequeño balanceo (ver ringAnim) para llamar la atención sin ser
 * ruidosa. Se puede arrastrar a cualquiera de las 4 esquinas de la
 * pantalla — basta con empezar a moverla, no hace falta arrastrarla mucho —
 * y se queda ahí (recordado en AsyncStorage) hasta que se vuelva a mover.
 * Un simple toque (sin arrastre) abre el panel de notificaciones.
 *
 * Qué cuenta como notificación (número en la campanita):
 * - Mensajes sin leer en el chat privado por producto (sql/product_chats.sql
 *   → get_unread_chat_count()): si eres cliente, cuenta las conversaciones
 *   en las que el administrador te ha escrito y no has abierto todavía; si
 *   eres tú (admin), cuenta las conversaciones en las que un cliente te ha
 *   escrito y no has abierto. Al tocar, lleva directo a la bandeja
 *   correspondiente (app/(tabs)/chat-global.tsx pestaña "Chat" para el
 *   cliente, app/admin/chats.tsx para el admin).
 * - Productos con "me gusta" que ya no están disponibles: los likes se
 *   guardan solo en este dispositivo (AsyncStorage, misma clave que
 *   app/producto/[id].tsx), así que se comprueba aquí si esos productos
 *   siguen siendo visibles en Supabase; los que ya no aparecen (borrados,
 *   despublicados o desactivados) se avisan, con un botón para quitarlos de
 *   favoritos y dejar de verlos.
 * - Novedades en la pestaña "Nuestras Novedades": como esa pestaña todavía
 *   es contenido de ejemplo fijo (ver app/(tabs)/chat-global.tsx), se avisa
 *   una vez por dispositivo usando un número de versión de contenido
 *   (NOVEDADES_CONTENT_VERSION) — el mismo número que hay en chat-global.tsx.
 *   Cuando el contenido de esa pestaña cambie de verdad, hay que subir el
 *   número en AMBOS archivos para que la campanita vuelva a avisar.
 *
 * Rendimiento: refreshChats() se repite cada POLL_MS (45s) MIENTRAS la app
 * esté abierta, en cualquier pantalla — es la llamada a Supabase más
 * constante de toda la app. En web, si el visitante deja la pestaña abierta
 * en segundo plano (cambia de pestaña, minimiza), el sondeo se PAUSA
 * (document.visibilitychange) en vez de seguir preguntando cada 45s sin que
 * nadie lo vea; en cuanto vuelve a la pestaña, se refresca al instante y el
 * sondeo se reanuda. En nativo (iOS/Android) no existe "document", así que
 * ahí sigue sondeando igual que antes.
 *
 * Conectado con:
 * - app/_layout.tsx → la monta una sola vez, fuera del Stack.
 * - lib/supabase.ts → sesión, rol de admin y la RPC get_unread_chat_count.
 * - sql/product_chats.sql → get_unread_chat_count(), mark_chat_read().
 * - app/producto/[id].tsx → misma clave de AsyncStorage para "me gusta"
 *   (LIKED_PRODUCTS_KEY), duplicada aquí igual que el resto del proyecto.
 * - app/(tabs)/chat-global.tsx → misma clave/versión de "Novedades vistas",
 *   y el destino "/chat-global?tab=privados" / "?tab=novedades".
 * - app/admin/chats.tsx → destino cuando quien toca es un admin.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";

const COLORS = {
  bg: "#FFFFFF",
  card: "#FFFFFF",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  accentSoft: "#EAF6FD",
  // Antes "#D4AF37" (dorado metálico apagado), luego "#F0B90B" (dorado más
  // vivo). Ahora un amarillo más claro, a petición de Jefe.
  gold: "#FFD54F",
  danger: "#DC2626",
};

// Mismas claves/valores que en otros archivos (ver cabecera) — este
// proyecto duplica constantes pequeñas por archivo en vez de compartirlas.
const CORNER_KEY = "videojuegoszaragoza:campanita_corner";
const LIKED_PRODUCTS_KEY = "videojuegoszaragoza:liked_products";
const NOVEDADES_SEEN_KEY = "videojuegoszaragoza:novedades_seen_version";
const NOVEDADES_CONTENT_VERSION = 1;

const BELL_SIZE = 56;
// Insets más pequeños: la campanita se pega más a la esquina de verdad (antes
// 14/60/92) para que no invada contenido como la barra de búsqueda o el
// texto de la cabecera.
const EDGE_INSET = 8;
const TOP_INSET = 40;
const BOTTOM_INSET = 80;
const TAP_THRESHOLD = 6; // px: por debajo de esto, es un toque, no un arrastre
const POLL_MS = 45000;

type Corner = "tl" | "tr" | "bl" | "br";
const CORNERS: Corner[] = ["tl", "tr", "bl", "br"];

function cornerToXY(corner: Corner) {
  const { width, height } = Dimensions.get("window");
  const x = corner === "tr" || corner === "br" ? width - BELL_SIZE - EDGE_INSET : EDGE_INSET;
  const y = corner === "tl" || corner === "tr" ? TOP_INSET : height - BELL_SIZE - BOTTOM_INSET;
  return { x, y };
}

async function getLikedProductIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(LIKED_PRODUCTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

export default function Campanita() {
  const [ready, setReady] = useState(false);
  const [corner, setCorner] = useState<Corner>("br");
  const cornerRef = useRef<Corner>("br");
  const posRef = useRef({ x: 0, y: 0 });
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const [panelOpen, setPanelOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unreadChats, setUnreadChats] = useState(0);
  const [likedUnavailable, setLikedUnavailable] = useState<string[]>([]);
  const [novedadesPending, setNovedadesPending] = useState(false);

  // --- posición: cargar esquina guardada y colocar la campanita ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      let initial: Corner = "br";
      try {
        const raw = await AsyncStorage.getItem(CORNER_KEY);
        if (raw && (CORNERS as string[]).includes(raw)) initial = raw as Corner;
      } catch {
        // se queda con "br"
      }
      if (!alive) return;
      cornerRef.current = initial;
      setCorner(initial);
      const xy = cornerToXY(initial);
      posRef.current = xy;
      pan.setValue(xy);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [pan]);

  // Si cambia el tamaño de la ventana (redimensionar en web, girar el
  // móvil), se recoloca en su misma esquina sin animación — si no, podría
  // quedarse fuera de la pantalla o dejar un hueco raro.
  useEffect(() => {
    const sub = Dimensions.addEventListener("change", () => {
      const xy = cornerToXY(cornerRef.current);
      posRef.current = xy;
      pan.setValue(xy);
    });
    return () => {
      // @ts-ignore — API antigua (RN<0.65) devuelve undefined, no objeto
      sub?.remove?.();
    };
  }, [pan]);

  // --- datos: sesión/rol + los 3 tipos de notificación --------------------
  const refreshAuth = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user ?? null;
      setIsLoggedIn(!!user);
      if (!user) {
        setIsAdmin(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle<{ role: string | null }>();
      setIsAdmin(String(profile?.role ?? "").trim().toLowerCase() === "admin");
    } catch {
      setIsLoggedIn(false);
      setIsAdmin(false);
    }
  }, []);

  const refreshChats = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        setUnreadChats(0);
        return;
      }
      const { data, error } = await supabase.rpc("get_unread_chat_count");
      if (error) throw error;
      setUnreadChats(typeof data === "number" ? data : 0);
    } catch {
      setUnreadChats(0);
    }
  }, []);

  const refreshLikes = useCallback(async () => {
    const ids = await getLikedProductIds();
    if (ids.length === 0) {
      setLikedUnavailable([]);
      return;
    }
    try {
      const { data, error } = await supabase.from("products").select("id").in("id", ids);
      if (error) throw error;
      const stillThere = new Set((data ?? []).map((r: any) => r.id as string));
      setLikedUnavailable(ids.filter((id) => !stillThere.has(id)));
    } catch {
      // sin conexión: se deja como estaba, no se inventa nada.
    }
  }, []);

  const refreshNovedades = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(NOVEDADES_SEEN_KEY);
      const seenVersion = raw ? parseInt(raw, 10) : 0;
      setNovedadesPending(!(seenVersion >= NOVEDADES_CONTENT_VERSION));
    } catch {
      setNovedadesPending(false);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
    refreshChats();
    refreshLikes();
    refreshNovedades();

    // Solo en web: si la pestaña está en segundo plano (el visitante cambió
    // de pestaña o la minimizó), no tiene sentido seguir preguntando a
    // Supabase cada 45s sin que nadie lo vea — se pausa el sondeo y se
    // retoma (con un refresco inmediato) en cuanto vuelve a primer plano.
    const hasDocument = typeof document !== "undefined";
    const isPageVisible = () => !hasDocument || document.visibilityState !== "hidden";

    const interval = setInterval(() => {
      if (isPageVisible()) refreshChats();
    }, POLL_MS);

    let onVisibilityChange: (() => void) | null = null;
    if (hasDocument) {
      onVisibilityChange = () => {
        if (document.visibilityState === "visible") refreshChats();
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      refreshAuth();
      refreshChats();
    });

    return () => {
      clearInterval(interval);
      if (hasDocument && onVisibilityChange) {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      authSub?.subscription?.unsubscribe?.();
    };
  }, [refreshAuth, refreshChats, refreshLikes, refreshNovedades]);

  const totalCount = unreadChats + likedUnavailable.length + (novedadesPending ? 1 : 0);
  const badgeLabel = totalCount > 9 ? "9+" : String(totalCount);

  // --- animación: la campana "suena" cada pocos segundos, un balanceo
  // suave que se repite en bucle en vez de un giro constante — llama la
  // atención sin marear.
  const ringAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(ringAnim, {
          toValue: 1,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ringAnim, {
          toValue: -1,
          duration: 170,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ringAnim, {
          toValue: 0.6,
          duration: 140,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ringAnim, {
          toValue: -0.3,
          duration: 120,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ringAnim, {
          toValue: 0,
          duration: 110,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [ringAnim]);

  const bellRotate = ringAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: ["-16deg", "16deg"],
  });

  // --- arrastrar / tocar ---------------------------------------------------
  const openPanel = useCallback(() => {
    setPanelOpen(true);
    refreshChats();
    refreshLikes();
    refreshNovedades();
  }, [refreshChats, refreshLikes, refreshNovedades]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset(posRef.current);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_evt, gestureState) => {
        pan.flattenOffset();

        const moved = Math.abs(gestureState.dx) + Math.abs(gestureState.dy);
        if (moved < TAP_THRESHOLD) {
          // Toque, no arrastre: se deja exactamente donde estaba y se abre
          // el panel de notificaciones.
          pan.setValue(posRef.current);
          openPanel();
          return;
        }

        const { width, height } = Dimensions.get("window");
        const endX = posRef.current.x + gestureState.dx;
        const endY = posRef.current.y + gestureState.dy;
        const centerX = endX + BELL_SIZE / 2;
        const centerY = endY + BELL_SIZE / 2;

        const nextCorner: Corner = ((centerY < height / 2 ? "t" : "b") +
          (centerX < width / 2 ? "l" : "r")) as Corner;

        const target = cornerToXY(nextCorner);
        posRef.current = target;
        cornerRef.current = nextCorner;
        setCorner(nextCorner);
        AsyncStorage.setItem(CORNER_KEY, nextCorner).catch(() => {});

        Animated.spring(pan, {
          toValue: target,
          useNativeDriver: false,
          friction: 7,
          tension: 60,
        }).start();
      },
    })
  ).current;

  // --- acciones del panel ---------------------------------------------------
  const handleOpenChats = useCallback(() => {
    setPanelOpen(false);
    if (isAdmin) {
      router.push("/admin/chats" as Href);
    } else {
      router.push("/chat-global?tab=privados" as Href);
    }
  }, [isAdmin]);

  const handleOpenNovedades = useCallback(() => {
    setPanelOpen(false);
    router.push("/chat-global?tab=novedades" as Href);
  }, []);

  const handleDismissLikes = useCallback(async () => {
    const removeIds = likedUnavailable;
    setLikedUnavailable([]);
    try {
      const current = await getLikedProductIds();
      const next = current.filter((id) => !removeIds.includes(id));
      await AsyncStorage.setItem(LIKED_PRODUCTS_KEY, JSON.stringify(next));
    } catch {
      // si falla, como mucho se vuelve a avisar la próxima vez.
    }
  }, [likedUnavailable]);

  if (!ready) return null;

  return (
    <>
      <Animated.View
        {...panResponder.panHandlers}
        style={{
          position: "absolute",
          zIndex: 99999,
          elevation: 20,
          width: BELL_SIZE,
          height: BELL_SIZE,
          alignItems: "center",
          justifyContent: "center",
          transform: pan.getTranslateTransform(),
        }}
      >
        {/* Solo la forma de la campana — sin círculo ni fondo alrededor. */}
        <Animated.View style={{ transform: [{ rotate: bellRotate }] }}>
          <Ionicons
            name="notifications"
            size={34}
            color={COLORS.gold}
            style={{
              textShadowColor: "rgba(0,0,0,0.28)",
              textShadowRadius: 6,
              textShadowOffset: { width: 0, height: 2 },
            }}
          />
        </Animated.View>

        {totalCount > 0 ? (
          <View
            style={{
              position: "absolute",
              top: 0,
              right: 2,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              paddingHorizontal: 4,
              backgroundColor: COLORS.danger,
              borderWidth: 2,
              borderColor: COLORS.bg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "900" }}>
              {badgeLabel}
            </Text>
          </View>
        ) : null}
      </Animated.View>

      <Modal
        visible={panelOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPanelOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}
          onPress={() => setPanelOpen(false)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: COLORS.bg,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              padding: 18,
              paddingBottom: Platform.OS === "ios" ? 34 : 22,
              maxHeight: "70%",
              gap: 14,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="notifications" size={19} color={COLORS.gold} />
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18 }}>
                  Notificaciones
                </Text>
              </View>
              <Pressable onPress={() => setPanelOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={COLORS.muted} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: 10 }}>
              {totalCount === 0 ? (
                <View
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.cardSoft,
                    padding: 16,
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.accent} />
                  <Text style={{ color: COLORS.text, fontWeight: "800" }}>Estás al día</Text>
                  <Text style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "center" }}>
                    No tienes notificaciones nuevas por ahora.
                  </Text>
                </View>
              ) : (
                <>
                  {unreadChats > 0 ? (
                    <NotifRow
                      icon="chatbubble-ellipses-outline"
                      title={
                        isAdmin
                          ? unreadChats === 1
                            ? "Un cliente te ha escrito"
                            : `${unreadChats} clientes te han escrito`
                          : unreadChats === 1
                          ? "Tienes un mensaje nuevo"
                          : `Tienes ${unreadChats} mensajes nuevos`
                      }
                      subtitle={
                        isAdmin
                          ? "Conversaciones por producto pendientes de responder."
                          : "El vendedor te ha respondido en el chat del producto."
                      }
                      actionLabel="Ver mensajes"
                      onPress={handleOpenChats}
                    />
                  ) : null}

                  {likedUnavailable.length > 0 ? (
                    <NotifRow
                      icon="heart-dislike-outline"
                      title={
                        likedUnavailable.length === 1
                          ? "Un producto que te gustó ya no está disponible"
                          : `${likedUnavailable.length} productos que te gustaron ya no están disponibles`
                      }
                      subtitle="Puede que se haya vendido o retirado del catálogo."
                      actionLabel="Quitar de favoritos"
                      onPress={handleDismissLikes}
                    />
                  ) : null}

                  {novedadesPending ? (
                    <NotifRow
                      icon="sparkles-outline"
                      title="Hay novedades"
                      subtitle='Échale un vistazo a "Nuestras Novedades" en el Foro.'
                      actionLabel="Ver novedades"
                      onPress={handleOpenNovedades}
                    />
                  ) : null}

                  {!isLoggedIn ? (
                    <Text
                      style={{
                        color: COLORS.muted,
                        fontSize: 11.5,
                        textAlign: "center",
                        marginTop: 4,
                      }}
                    >
                      Inicia sesión para ver también los avisos de tus conversaciones.
                    </Text>
                  ) : null}
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function NotifRow({
  icon,
  title,
  subtitle,
  actionLabel,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle: string;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.cardSoft,
        padding: 14,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            backgroundColor: COLORS.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={17} color={COLORS.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13.5, lineHeight: 18 }}>
            {title}
          </Text>
          <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 17 }}>{subtitle}</Text>
        </View>
      </View>

      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          opacity: pressed ? 0.85 : 1,
          alignSelf: "flex-start",
          borderRadius: 999,
          borderWidth: 1,
          borderColor: COLORS.accentSoft,
          backgroundColor: COLORS.bg,
          paddingVertical: 7,
          paddingHorizontal: 14,
        })}
      >
        <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 12.5 }}>
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}
