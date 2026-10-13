/**
 * components/Campanita.tsx — "Blue", la asistente flotante de ventas
 *
 * Qué hace: antes era una campanita; ahora es Blue, el capibara asistente de la
 * tienda, flotando en una esquina de TODA la app (se monta una sola vez en
 * app/_layout.tsx, fuera del Stack, así que no se reinicia al navegar).
 * - Se mueve sola (components/marca/MarcaAnimada.tsx) y se puede arrastrar a
 *   cualquiera de las 4 esquinas (se recuerda en AsyncStorage).
 * - Habla con bocadillos:
 *   · En la ficha de un producto, tras 8 s: un dato real del producto (si la
 *     descripción menciona la garantía, esa frase; si no, que es unidad única y se
 *     reserva 15 minutos en la cesta) y después cómo se entrega (en persona en
 *     Zaragoza o envío a toda España); al tocarlos se abre el chat de la tienda
 *     (Blue IA con el producto ya indicado; desde ahí, si hace falta, el equipo).
 *   · En el resto de la tienda, tras 12 s: una de las "Noticias Flash" activas
 *     (tabla flash_news, se editan en app/admin/flash-news.tsx).
 *   Cada bocadillo sale una sola vez por visita y se cierra con la X.
 * - Al tocar a Blue se abre su panel con 3 pestañas: "Asistente" (hablar con Blue
 *   IA, hablar con nuestro equipo —pasando antes por Blue IA—, "Vender"), "Notificaciones" (lo que antes era la campanita:
 *   mensajes sin leer, favoritos que ya no están, novedades; con su número) y
 *   "Noticias" (Noticias Flash). Si hay notificaciones, abre en esa pestaña.
 *
 * Rendimiento: el sondeo de mensajes sin leer (45 s) se pausa con la pestaña en
 * segundo plano (web). Las consultas del bocadillo son pequeñas y de una fila.
 *
 * Conectado con:
 * - app/_layout.tsx → la monta una sola vez.
 * - app/(tabs)/blue-ia.tsx → chat completo con Blue IA.
 * - sql/product_chats.sql → get_unread_chat_count().
 * - app/producto/[id].tsx → misma clave de "me gusta" (LIKED_PRODUCTS_KEY).
 * - app/(tabs)/chat-global.tsx → misma clave/versión de "Novedades vistas".
 * - components/VenderAhoraModal.tsx → formulario "Vender" desde el panel.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { router, usePathname, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import MarcaAnimada from "./marca/MarcaAnimada";
import VenderAhoraModal from "./VenderAhoraModal";

const COLORS = {
  bg: "#FFFFFF",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  accentDark: "#0E86C4",
  accentSoft: "#EAF6FD",
  danger: "#DC2626",
};

const CORNER_KEY = "videojuegoszaragoza:campanita_corner";
const LIKED_PRODUCTS_KEY = "videojuegoszaragoza:liked_products";
const NOVEDADES_SEEN_KEY = "videojuegoszaragoza:novedades_seen_version";
const NOVEDADES_CONTENT_VERSION = 1;

const BLUE_SIZE = 72;
const EDGE_INSET = 6;
const TOP_INSET = 40;
const BOTTOM_INSET = 84;
const TAP_THRESHOLD = 6;
const POLL_MS = 45000;
const PRODUCTO_ESPERA_MS = 8000;
const SEGUNDO_MENSAJE_MS = 7000;
const NOTICIA_ESPERA_MS = 12000;

type Corner = "tl" | "tr" | "bl" | "br";
const CORNERS: Corner[] = ["tl", "tr", "bl", "br"];

// "chat" lleva al chat de la tienda (Blue IA primero; desde ahí, el equipo).
type Bocadillo = { id: string; texto: string; accion?: "chat" | "panel"; ruta?: string };

// Lo que ya dijo Blue en esta visita (no se repite al volver a la misma ficha).
const yaDicho = new Set<string>();

function cornerToXY(corner: Corner) {
  const { width, height } = Dimensions.get("window");
  const x = corner === "tr" || corner === "br" ? width - BLUE_SIZE - EDGE_INSET : EDGE_INSET;
  const y = corner === "tl" || corner === "tr" ? TOP_INSET : height - BLUE_SIZE - BOTTOM_INSET;
  return { x, y };
}

async function getLikedProductIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(LIKED_PRODUCTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

// Frase de la descripción que habla de la garantía (la escribe la tienda en cada producto).
function fraseGarantia(descripcion: string | null | undefined): string | null {
  const texto = String(descripcion ?? "").replace(/\s+/g, " ").trim();
  if (!texto) return null;
  const f = texto.match(/[^.!?¡¿]*garant[ií]a[^.!?]*/i)?.[0];
  if (!f) return null;
  return f.replace(/^[\s,;:-]+/, "").trim().slice(0, 160);
}

function mensajeProducto(titulo: string, descripcion: string | null): string {
  const garantia = fraseGarantia(descripcion);
  if (garantia) {
    if (/^(incluye|tiene|viene|cuenta|lleva|está|esta)\b/i.test(garantia)) {
      return `¿Sabías que ${titulo} ${garantia.charAt(0).toLowerCase()}${garantia.slice(1)}?`;
    }
    return `Sobre ${titulo}: ${garantia}.`;
  }
  return `¿Te gusta ${titulo}? Es unidad única: si la añades a la cesta te la reservamos 15 minutos.`;
}

export default function Campanita() {
  const pathname = usePathname() ?? "";
  const enAdmin = pathname.startsWith("/admin");

  const [ready, setReady] = useState(false);
  const cornerRef = useRef<Corner>("br");
  const [corner, setCorner] = useState<Corner>("br");
  const posRef = useRef({ x: 0, y: 0 });
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const [panelOpen, setPanelOpen] = useState(false);
  const [venderOpen, setVenderOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unreadChats, setUnreadChats] = useState(0);
  const [likedUnavailable, setLikedUnavailable] = useState<string[]>([]);
  const [novedadesPending, setNovedadesPending] = useState(false);
  const [noticias, setNoticias] = useState<string[]>([]);
  const [bocadillo, setBocadillo] = useState<Bocadillo | null>(null);
  // Pestañas del panel de Blue: asistente, notificaciones (antes la campanita) y noticias.
  const [pestana, setPestana] = useState<"blue" | "avisos" | "noticias">("blue");

  // --- posición -------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      let initial: Corner = "br";
      try {
        const raw = await AsyncStorage.getItem(CORNER_KEY);
        if (raw && (CORNERS as string[]).includes(raw)) initial = raw as Corner;
      } catch {
        // se queda en "br"
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

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", () => {
      const xy = cornerToXY(cornerRef.current);
      posRef.current = xy;
      pan.setValue(xy);
    });
    return () => {
      // @ts-ignore — API antigua (RN<0.65) devuelve undefined
      sub?.remove?.();
    };
  }, [pan]);

  // --- datos -----------------------------------------------------------------
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
      const stillThere = new Set((data ?? []).map((r: { id: string }) => r.id));
      setLikedUnavailable(ids.filter((id) => !stillThere.has(id)));
    } catch {
      // sin conexión: se deja como estaba
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

  const refreshNoticias = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("flash_news")
        .select("message,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(5);
      if (error) throw error;
      setNoticias((data ?? []).map((r: { message: string | null }) => String(r.message ?? "").trim()).filter(Boolean));
    } catch {
      setNoticias([]);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
    refreshChats();
    refreshLikes();
    refreshNovedades();
    refreshNoticias();

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
      if (hasDocument && onVisibilityChange) document.removeEventListener("visibilitychange", onVisibilityChange);
      authSub?.subscription?.unsubscribe?.();
    };
  }, [refreshAuth, refreshChats, refreshLikes, refreshNovedades, refreshNoticias]);

  const totalCount = unreadChats + likedUnavailable.length + (novedadesPending ? 1 : 0);
  const badgeLabel = totalCount > 9 ? "9+" : String(totalCount);

  // --- bocadillos según la pantalla --------------------------------------------
  useEffect(() => {
    setBocadillo(null);
    if (enAdmin || pathname.startsWith("/checkout") || pathname.startsWith("/blue-ia")) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let vivo = true;
    const m = pathname.match(/^\/producto\/([0-9a-f-]{36})/i);

    if (m) {
      const id = m[1];
      if (yaDicho.has(`p:${id}`)) return;
      timers.push(
        setTimeout(async () => {
          try {
            const { data } = await supabase
              .from("products")
              .select("title,description")
              .eq("id", id)
              .maybeSingle<{ title: string; description: string | null }>();
            if (!vivo || !data?.title) return;
            yaDicho.add(`p:${id}`);
            const titulo = data.title.trim();
            const ruta = `/blue-ia?producto=${id}`;
            setBocadillo({ id: `p1:${id}`, texto: mensajeProducto(titulo, data.description), accion: "chat", ruta });
            timers.push(
              setTimeout(() => {
                if (!vivo) return;
                setBocadillo({
                  id: `p2:${id}`,
                  texto:
                    "Realizamos entregas en persona en la ciudad de Zaragoza o envíos a toda España. Escríbenos tocando aquí mismo.",
                  accion: "chat",
                  ruta,
                });
              }, SEGUNDO_MENSAJE_MS)
            );
          } catch {
            // sin bocadillo si falla
          }
        }, PRODUCTO_ESPERA_MS)
      );
    } else if (noticias.length) {
      const pendiente = noticias.find((n) => !yaDicho.has(`n:${n}`));
      if (pendiente) {
        timers.push(
          setTimeout(() => {
            if (!vivo) return;
            yaDicho.add(`n:${pendiente}`);
            setBocadillo({ id: `n:${pendiente}`, texto: pendiente, accion: "panel" });
          }, NOTICIA_ESPERA_MS)
        );
      }
    }

    return () => {
      vivo = false;
      timers.forEach(clearTimeout);
    };
  }, [pathname, enAdmin, noticias]);

  // Animación de entrada del bocadillo.
  const bocAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!bocadillo) return;
    bocAnim.setValue(0);
    Animated.timing(bocAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [bocadillo, bocAnim]);

  // --- arrastrar / tocar --------------------------------------------------------
  const totalRef = useRef(0);
  totalRef.current = totalCount;

  const openPanel = useCallback((tab?: "blue" | "avisos" | "noticias") => {
    setBocadillo(null);
    // Si hay notificaciones pendientes, se abre directamente en esa pestaña.
    setPestana(tab ?? (totalRef.current > 0 ? "avisos" : "blue"));
    setPanelOpen(true);
    refreshChats();
    refreshLikes();
    refreshNovedades();
  }, [refreshChats, refreshLikes, refreshNovedades]);

  const openPanelRef = useRef(openPanel);
  openPanelRef.current = openPanel;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset(posRef.current);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_evt, g) => {
        pan.flattenOffset();
        if (Math.abs(g.dx) + Math.abs(g.dy) < TAP_THRESHOLD) {
          pan.setValue(posRef.current);
          openPanelRef.current();
          return;
        }
        const { width, height } = Dimensions.get("window");
        const cx = posRef.current.x + g.dx + BLUE_SIZE / 2;
        const cy = posRef.current.y + g.dy + BLUE_SIZE / 2;
        const next = ((cy < height / 2 ? "t" : "b") + (cx < width / 2 ? "l" : "r")) as Corner;
        const target = cornerToXY(next);
        posRef.current = target;
        cornerRef.current = next;
        setCorner(next);
        AsyncStorage.setItem(CORNER_KEY, next).catch(() => {});
        Animated.spring(pan, { toValue: target, useNativeDriver: false, friction: 7, tension: 60 }).start();
      },
    })
  ).current;

  // --- acciones -----------------------------------------------------------------
  const alTocarBocadillo = useCallback(() => {
    const b = bocadillo;
    setBocadillo(null);
    if (!b) return;
    if (b.accion === "chat") router.push((b.ruta ?? "/blue-ia") as Href);
    else openPanel("noticias");
  }, [bocadillo, openPanel]);

  const ir = useCallback((href: string) => {
    setPanelOpen(false);
    router.push(href as Href);
  }, []);

  const handleDismissLikes = useCallback(async () => {
    const removeIds = likedUnavailable;
    setLikedUnavailable([]);
    try {
      const current = await getLikedProductIds();
      await AsyncStorage.setItem(LIKED_PRODUCTS_KEY, JSON.stringify(current.filter((id) => !removeIds.includes(id))));
    } catch {
      // como mucho se vuelve a avisar
    }
  }, [likedUnavailable]);

  // En las pantallas de chat (y en el propio chat de Blue IA) no se muestra: taparía
  // el campo de escribir y el botón de enviar.
  const enChat = pathname.startsWith("/blue-ia") || pathname.startsWith("/chat-global") || pathname.startsWith("/chat/");
  if (!ready || enChat) return null;

  const derecha = corner === "tr" || corner === "br";
  const arriba = corner === "tl" || corner === "tr";

  return (
    <>
      <Animated.View
        style={{
          position: "absolute",
          zIndex: 99999,
          elevation: 20,
          width: BLUE_SIZE,
          height: BLUE_SIZE,
          transform: pan.getTranslateTransform(),
        }}
      >
        {/* Bocadillo de Blue: sale hacia el centro de la pantalla. */}
        {bocadillo ? (
          <Animated.View
            style={{
              position: "absolute",
              width: 248,
              [derecha ? "right" : "left"]: 4,
              [arriba ? "top" : "bottom"]: BLUE_SIZE + 4,
              opacity: bocAnim,
              transform: [{ scale: bocAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
            }}
          >
            <Pressable
              onPress={alTocarBocadillo}
              accessibilityRole="button"
              style={{
                backgroundColor: COLORS.bg,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.border,
                paddingVertical: 12,
                paddingHorizontal: 14,
                paddingRight: 30,
                shadowColor: "#0B2138",
                shadowOpacity: 0.12,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: 8,
              }}
            >
              <Text style={{ color: COLORS.accentDark, fontWeight: "900", fontSize: 12, marginBottom: 2 }}>Blue</Text>
              <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 13.5, lineHeight: 19 }}>{bocadillo.texto}</Text>
              {bocadillo.accion === "chat" ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color={COLORS.accentDark} />
                  <Text style={{ color: COLORS.accentDark, fontWeight: "900", fontSize: 12.5 }}>Escribir ahora</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => setBocadillo(null)}
              hitSlop={10}
              accessibilityLabel="Cerrar mensaje de Blue"
              style={{ position: "absolute", top: 8, right: 8 }}
            >
              <Ionicons name="close" size={16} color={COLORS.muted} />
            </Pressable>
          </Animated.View>
        ) : null}

        <View {...panResponder.panHandlers} style={{ width: BLUE_SIZE, height: BLUE_SIZE, alignItems: "center", justifyContent: "center" }}>
          <MarcaAnimada cual="carga" ancho={BLUE_SIZE} tocable={false} />
          {totalCount > 0 ? (
            <View
              style={{
                position: "absolute",
                top: 2,
                right: 4,
                minWidth: 20,
                height: 20,
                borderRadius: 10,
                paddingHorizontal: 4,
                backgroundColor: COLORS.danger,
                borderWidth: 2,
                borderColor: COLORS.bg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "900" }}>{badgeLabel}</Text>
            </View>
          ) : null}
        </View>
      </Animated.View>

      <Modal visible={panelOpen} transparent animationType="fade" onRequestClose={() => setPanelOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end", alignItems: "center" }}
          onPress={() => setPanelOpen(false)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: "100%",
              maxWidth: 560,
              backgroundColor: COLORS.bg,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 18,
              paddingBottom: Platform.OS === "ios" ? 34 : 22,
              maxHeight: "80%",
            }}
          >
            <Pressable onPress={() => setPanelOpen(false)} hitSlop={10} style={{ position: "absolute", top: 14, right: 16, zIndex: 2 }}>
              <Ionicons name="close" size={22} color={COLORS.muted} />
            </Pressable>

            <View style={{ alignItems: "center", gap: 6, marginBottom: 12 }}>
              <MarcaAnimada cual="tienda" ancho={pestana === "blue" ? 104 : 64} />
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>Blue</Text>
            </View>

            {/* Pestañas: Blue (asistente) · Notificaciones · Noticias */}
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 14 }}>
              {(
                [
                  { key: "blue", label: "Asistente", icono: "sparkles-outline", n: 0 },
                  { key: "avisos", label: "Notificaciones", icono: "notifications-outline", n: totalCount },
                  { key: "noticias", label: "Noticias", icono: "megaphone-outline", n: 0 },
                ] as const
              ).map((p) => {
                const activa = pestana === p.key;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setPestana(p.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: activa }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderBottomWidth: 2,
                      borderBottomColor: activa ? COLORS.accent : "transparent",
                    }}
                  >
                    <Ionicons name={p.icono} size={15} color={activa ? COLORS.accentDark : COLORS.muted} />
                    <Text style={{ color: activa ? COLORS.accentDark : COLORS.muted, fontWeight: "900", fontSize: 13 }}>
                      {p.label}
                    </Text>
                    {p.n > 0 ? (
                      <View
                        style={{
                          minWidth: 18,
                          height: 18,
                          borderRadius: 9,
                          paddingHorizontal: 4,
                          backgroundColor: COLORS.danger,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "900" }}>{badgeLabel}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <ScrollView contentContainerStyle={{ gap: 14, alignItems: "center", paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
              {pestana === "blue" ? (
              <>
              <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>
                Tu asistente de VideojuegosZaragoza.com. ¿En qué te ayudo?
              </Text>

              <View style={{ width: "100%", gap: 10, maxWidth: 380 }}>
                <BotonPanel icono="sparkles-outline" texto="Hablar con Blue IA" principal onPress={() => ir("/blue-ia")} />
                {/* Primero conversa Blue IA; desde ese chat se puede pasar a nuestro equipo. */}
                <BotonPanel icono="people-outline" texto="Hablar con nuestro equipo" onPress={() => ir("/blue-ia")} />
                <BotonPanel
                  icono="cash-outline"
                  texto="Vender mi consola o dispositivo"
                  onPress={() => {
                    setPanelOpen(false);
                    setVenderOpen(true);
                  }}
                />
              </View>

              </>
              ) : null}

              {pestana === "noticias" ? (
                <View style={{ width: "100%", gap: 12, alignItems: "center" }}>
                  {noticias.length ? (
                    noticias.map((n, i) => (
                      <Text
                        key={n}
                        style={{
                          color: COLORS.text,
                          fontWeight: "700",
                          textAlign: "center",
                          lineHeight: 21,
                          paddingTop: i ? 12 : 0,
                          borderTopWidth: i ? 1 : 0,
                          borderTopColor: COLORS.border,
                          alignSelf: "stretch",
                        }}
                      >
                        {n}
                      </Text>
                    ))
                  ) : (
                    <Text style={{ color: COLORS.muted, textAlign: "center" }}>No hay noticias ahora mismo.</Text>
                  )}
                </View>
              ) : null}

              {pestana === "avisos" ? (
              <View style={{ width: "100%", gap: 12, alignItems: "center" }}>
                {totalCount === 0 ? (
                  <Text style={{ color: COLORS.muted, textAlign: "center" }}>Estás al día: no tienes avisos nuevos.</Text>
                ) : (
                  <>
                    {unreadChats > 0 ? (
                      <Aviso
                        titulo={
                          isAdmin
                            ? unreadChats === 1
                              ? "Un cliente te ha escrito"
                              : `${unreadChats} clientes te han escrito`
                            : unreadChats === 1
                              ? "Tienes un mensaje nuevo"
                              : `Tienes ${unreadChats} mensajes nuevos`
                        }
                        accion="Ver mensajes"
                        onPress={() => ir(isAdmin ? "/admin/chats" : "/chat-global?tab=privados")}
                      />
                    ) : null}
                    {likedUnavailable.length > 0 ? (
                      <Aviso
                        titulo={
                          likedUnavailable.length === 1
                            ? "Un producto que te gustó ya no está disponible"
                            : `${likedUnavailable.length} productos que te gustaron ya no están disponibles`
                        }
                        accion="Quitar de favoritos"
                        onPress={handleDismissLikes}
                      />
                    ) : null}
                    {novedadesPending ? (
                      <Aviso titulo="Hay novedades en el Foro" accion="Ver novedades" onPress={() => ir("/chat-global?tab=novedades")} />
                    ) : null}
                  </>
                )}
                {!isLoggedIn ? (
                  <Text style={{ color: COLORS.muted, fontSize: 12, textAlign: "center" }}>
                    Inicia sesión para ver también los avisos de tus conversaciones.
                  </Text>
                ) : null}
              </View>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {venderOpen ? <VenderAhoraModal visible={venderOpen} onClose={() => setVenderOpen(false)} /> : null}
    </>
  );
}

function BotonPanel({
  icono,
  texto,
  principal,
  onPress,
}: {
  icono: React.ComponentProps<typeof Ionicons>["name"];
  texto: string;
  principal?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.88 : 1,
        minHeight: 48,
        borderRadius: 999,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderWidth: principal ? 0 : 1.5,
        borderColor: COLORS.accent,
        backgroundColor: principal ? COLORS.accentDark : COLORS.bg,
      })}
    >
      <Ionicons name={icono} size={17} color={principal ? "#FFFFFF" : COLORS.accentDark} />
      <Text style={{ color: principal ? "#FFFFFF" : COLORS.accentDark, fontWeight: "900", fontSize: 14.5 }}>{texto}</Text>
    </Pressable>
  );
}

function Aviso({ titulo, accion, onPress }: { titulo: string; accion: string; onPress: () => void }) {
  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <Text style={{ color: COLORS.text, fontWeight: "800", textAlign: "center" }}>{titulo}</Text>
      <Pressable onPress={onPress} hitSlop={6}>
        <Text style={{ color: COLORS.accent, fontWeight: "900", textAlign: "center" }}>{accion}</Text>
      </Pressable>
    </View>
  );
}
