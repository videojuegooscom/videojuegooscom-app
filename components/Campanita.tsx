/**
 * components/Campanita.tsx — "Blue", la asistente flotante de ventas
 *
 * Qué hace: antes era una campanita; ahora es Blue, el capibara asistente de la
 * tienda, flotando en una esquina de TODA la app (se monta una sola vez en
 * app/_layout.tsx, fuera del Stack, así que no se reinicia al navegar).
 * - Se mueve sola (components/marca/MarcaAnimada.tsx) y se puede arrastrar a
 *   cualquiera de las 4 esquinas (se recuerda en AsyncStorage).
 * - Aparece 10 s después de entrar en la web (APARECER_MS, contados desde que
 *   se abrió la página con performance.now()): antes no se ve ni se puede tocar.
 *   Entra con un rebote de escala, saluda moviéndose de lado a lado y enseña un
 *   mini bocadillo "¡Hola! Soy Blue" unos segundos (al tocarlo abre su panel).
 * - Scroll (solo web): al bajar se desliza hacia su borde y se desvanece; al
 *   subir vuelve. Escucha el scroll de CUALQUIER contenedor (listener en
 *   document con capture) y compara el scrollTop de ese mismo elemento con el
 *   anterior, con un umbral de 12 px para no parpadear; los carruseles
 *   horizontales (no cambian scrollTop) no cuentan. Cerca del principio
 *   (scrollTop < 40) siempre se ve. No se oculta con su panel abierto, con un
 *   bocadillo o con el saludo a la vista, y vuelve a verse al cambiar de pantalla.
 * - Habla con bocadillos (solo cuando ya ha aparecido):
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
 * - Avisos de Noticias Gaming: si el cliente los activó (con sesión,
 *   preferencias_usuario.avisos_noticias; sin sesión o si esa tabla falla, la clave
 *   local NOTICIAS_AVISOS_KEY = "1"), cuenta las noticias publicadas desde la última
 *   vez que las vio (lo más reciente entre preferencias_usuario.noticias_vistas_hasta
 *   y NOTICIAS_VISTAS_KEY; si no hay ninguna, las de las últimas 24 h). Se suman al
 *   número rojo y salen en Notificaciones ("Ver noticias"). Si no están activados,
 *   ahí mismo se explica cómo activarlos (campana de Noticias Gaming).
 *
 * Rendimiento: el sondeo (45 s) de mensajes sin leer y de noticias nuevas se pausa
 * con la pestaña en segundo plano (web). El recuento de noticias es head (sin
 * filas). Las consultas del bocadillo son pequeñas y de una fila.
 *
 * Conectado con:
 * - app/_layout.tsx → la monta una sola vez.
 * - app/(tabs)/blue-ia.tsx → chat completo con Blue IA.
 * - sql/product_chats.sql → get_unread_chat_count().
 * - app/producto/[id].tsx → misma clave de "me gusta" (LIKED_PRODUCTS_KEY).
 * - app/(tabs)/chat-global.tsx → misma clave/versión de "Novedades vistas" y mismas
 *   claves de avisos de noticias (activar con la campana; marcar como vistas).
 * - supabase/migrations/20261013200000_noticias_comentarios_preferencias.sql →
 *   tabla preferencias_usuario (cada usuario lee la suya).
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
// Avisos de Noticias Gaming sin sesión ("1" = activados) y fecha ISO de la última
// vez que se vieron las noticias (las escribe app/(tabs)/chat-global.tsx).
const NOTICIAS_AVISOS_KEY = "videojuegoszaragoza:noticias_avisos";
const NOTICIAS_VISTAS_KEY = "videojuegoszaragoza:noticias_vistas_hasta";
const DIA_MS = 24 * 60 * 60 * 1000;

const BLUE_SIZE = 72;
const EDGE_INSET = 6;
const TOP_INSET = 40;
const BOTTOM_INSET = 84;
const TAP_THRESHOLD = 6;
const POLL_MS = 45000;
const PRODUCTO_ESPERA_MS = 8000;
const SEGUNDO_MENSAJE_MS = 7000;
const NOTICIA_ESPERA_MS = 12000;
// Blue aparece 10 s después de entrar en la web; el saludo se ve unos segundos.
const APARECER_MS = 10000;
const SALUDO_MS = 2800;
// Scroll: píxeles mínimos para ocultar/mostrar (sin parpadeos) y zona de arriba
// en la que siempre se ve.
const SCROLL_UMBRAL = 12;
const SCROLL_ARRIBA = 40;
// Cuánto se desliza hacia su borde al ocultarse.
const DESLIZ_OCULTO = BLUE_SIZE + EDGE_INSET + 16;
// Animaciones por el hilo nativo salvo en web (allí no existe).
const USA_NATIVO = Platform.OS !== "web";

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

// Fecha ISO → milisegundos (0 si falta o no es válida).
function isoAMs(iso: string | null | undefined): number {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? ms : 0;
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
  // En las pantallas de chat (y en el propio chat de Blue IA) no se muestra: taparía
  // el campo de escribir y el botón de enviar.
  const enChat = pathname.startsWith("/blue-ia") || pathname.startsWith("/chat-global") || pathname.startsWith("/chat/");

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
  // Avisos de Noticias Gaming: si están activados y cuántas hay sin ver.
  const [avisosNoticias, setAvisosNoticias] = useState(false);
  const [noticiasNuevas, setNoticiasNuevas] = useState(0);
  const [bocadillo, setBocadillo] = useState<Bocadillo | null>(null);
  // Pestañas del panel de Blue: asistente, notificaciones (antes la campanita) y noticias.
  const [pestana, setPestana] = useState<"blue" | "avisos" | "noticias">("blue");
  // Aparición a los 10 s, mini saludo y oculto por scroll hacia abajo.
  const [aparecido, setAparecido] = useState(false);
  const [saludando, setSaludando] = useState(false);
  const [ocultoScroll, setOcultoScroll] = useState(false);

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

  // Noticias Gaming nuevas desde la última vez que se vieron (solo si hay avisos activados).
  const refreshNoticiasNuevas = useCallback(async () => {
    let avisoLocal: string | null = null;
    let vistasLocal: string | null = null;
    try {
      avisoLocal = await AsyncStorage.getItem(NOTICIAS_AVISOS_KEY);
      vistasLocal = await AsyncStorage.getItem(NOTICIAS_VISTAS_KEY);
    } catch {
      // sin almacenamiento local: se sigue con lo de la cuenta
    }

    let activado = avisoLocal === "1";
    let vistasCuenta: string | null = null;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (user) {
        const { data, error } = await supabase
          .from("preferencias_usuario")
          .select("avisos_noticias,noticias_vistas_hasta")
          .eq("user_id", user.id)
          .maybeSingle<{ avisos_noticias: boolean | null; noticias_vistas_hasta: string | null }>();
        if (error) throw error;
        // Con fila guardada manda la cuenta; sin fila, lo local.
        if (data) {
          activado = data.avisos_noticias === true;
          vistasCuenta = data.noticias_vistas_hasta;
        }
      }
    } catch {
      // la tabla puede no existir aún: solo lo local
    }

    setAvisosNoticias(activado);
    if (!activado) {
      setNoticiasNuevas(0);
      return;
    }

    const vistasMs = Math.max(isoAMs(vistasCuenta), isoAMs(vistasLocal));
    const desde = new Date(vistasMs || Date.now() - DIA_MS).toISOString();
    try {
      const { count, error } = await supabase
        .from("noticias_gaming")
        .select("id", { count: "exact", head: true })
        .eq("publicada", true)
        .gt("created_at", desde);
      if (error) throw error;
      setNoticiasNuevas(count ?? 0);
    } catch {
      setNoticiasNuevas(0);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
    refreshChats();
    refreshLikes();
    refreshNovedades();
    refreshNoticias();
    // refreshNoticiasNuevas() al montar lo hace el efecto de la ruta (más abajo).

    const hasDocument = typeof document !== "undefined";
    const isPageVisible = () => !hasDocument || document.visibilityState !== "hidden";
    const interval = setInterval(() => {
      if (!isPageVisible()) return;
      refreshChats();
      refreshNoticiasNuevas();
    }, POLL_MS);

    let onVisibilityChange: (() => void) | null = null;
    if (hasDocument) {
      onVisibilityChange = () => {
        if (document.visibilityState !== "visible") return;
        refreshChats();
        refreshNoticiasNuevas();
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      refreshAuth();
      refreshChats();
      refreshNoticiasNuevas();
    });

    return () => {
      clearInterval(interval);
      if (hasDocument && onVisibilityChange) document.removeEventListener("visibilitychange", onVisibilityChange);
      authSub?.subscription?.unsubscribe?.();
    };
  }, [refreshAuth, refreshChats, refreshLikes, refreshNovedades, refreshNoticias, refreshNoticiasNuevas]);

  // Cuenta las noticias al montar y otra vez al salir del Foro (donde se ven y se
  // actualiza la clave local de "vistas"), para que el número rojo no se quede viejo.
  const enForo = pathname.startsWith("/chat-global");
  useEffect(() => {
    if (!enForo) refreshNoticiasNuevas();
  }, [enForo, refreshNoticiasNuevas]);

  const totalCount = unreadChats + likedUnavailable.length + (novedadesPending ? 1 : 0) + noticiasNuevas;
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

  // --- aparición, saludo y scroll ---------------------------------------------------
  // 10 s desde que se abrió la página (performance.now() cuenta desde la carga).
  useEffect(() => {
    const yaPasado = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : 0;
    const timer = setTimeout(() => setAparecido(true), Math.max(0, APARECER_MS - yaPasado));
    return () => clearTimeout(timer);
  }, []);

  const entrada = useRef(new Animated.Value(0)).current;
  const saludo = useRef(new Animated.Value(0)).current;
  const chipAnim = useRef(new Animated.Value(0)).current;
  const ocultar = useRef(new Animated.Value(0)).current;
  const entradaHechaRef = useRef(false);
  const enPantalla = aparecido && ready && !enChat;

  // Entrada (una sola vez, la primera vez que se ve): rebote de escala y saludo
  // moviéndose de lado a lado.
  useEffect(() => {
    if (!enPantalla || entradaHechaRef.current) return;
    entradaHechaRef.current = true;
    entrada.setValue(0);
    saludo.setValue(0);
    Animated.spring(entrada, { toValue: 1, friction: 4.2, tension: 70, useNativeDriver: USA_NATIVO }).start();
    const paso = (toValue: number, duration: number) =>
      Animated.timing(saludo, { toValue, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: USA_NATIVO });
    Animated.sequence([Animated.delay(420), paso(1, 130), paso(-1, 180), paso(0.7, 160), paso(-0.4, 140), paso(0, 130)]).start();
    setSaludando(true);
  }, [enPantalla, entrada, saludo]);

  // Mini bocadillo "¡Hola! Soy Blue": entra tras el rebote y se va solo.
  useEffect(() => {
    if (!saludando) return;
    chipAnim.setValue(0);
    Animated.timing(chipAnim, {
      toValue: 1,
      duration: 280,
      delay: 360,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: USA_NATIVO,
    }).start();
    const timer = setTimeout(() => {
      Animated.timing(chipAnim, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: USA_NATIVO }).start(() =>
        setSaludando(false)
      );
    }, SALUDO_MS);
    return () => clearTimeout(timer);
  }, [saludando, chipAnim]);

  // Con el panel abierto, un bocadillo o el saludo a la vista no se oculta (lo lee
  // el listener de scroll, que se registra una sola vez).
  const bocadilloVisible = aparecido && !!bocadillo;
  const noOcultarRef = useRef(false);
  noOcultarRef.current = panelOpen || bocadilloVisible || saludando;

  const ocultoScrollRef = useRef(false);
  const ponerOcultoScroll = useCallback((oculto: boolean) => {
    if (ocultoScrollRef.current === oculto) return;
    ocultoScrollRef.current = oculto;
    setOcultoScroll(oculto);
  }, []);

  // Scroll de CUALQUIER contenedor (los ScrollView de la web son divs con su propio
  // scroll, que no burbujea: por eso capture). Se compara el scrollTop de ese mismo
  // elemento con el anterior: bajar ≥ 12 px oculta, subir ≥ 12 px muestra.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || !aparecido) return;
    // Último scrollTop de cada contenedor (WeakMap: no retiene los que se desmontan).
    const ultimos = new WeakMap<object, number>();
    const alHacerScroll = (ev: Event) => {
      const t = ev.target;
      const elemento = t instanceof Element && t !== document.documentElement && t !== document.body ? t : null;
      const clave: object = elemento ?? document;
      const y = elemento ? elemento.scrollTop : window.scrollY || document.documentElement.scrollTop || 0;
      const previo = ultimos.get(clave);
      if (previo === undefined) {
        ultimos.set(clave, y);
        return;
      }
      // Scroll horizontal (carruseles): el scrollTop no cambia, no cuenta.
      if (y === previo) return;
      if (y < SCROLL_ARRIBA) {
        ultimos.set(clave, y);
        ponerOcultoScroll(false);
        return;
      }
      const delta = y - previo;
      if (Math.abs(delta) < SCROLL_UMBRAL) return;
      ultimos.set(clave, y);
      if (delta < 0) ponerOcultoScroll(false);
      else if (!noOcultarRef.current) ponerOcultoScroll(true);
    };
    document.addEventListener("scroll", alHacerScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", alHacerScroll, { capture: true });
  }, [aparecido, ponerOcultoScroll]);

  // Al cambiar de pantalla vuelve a verse; también si sale un bocadillo.
  useEffect(() => {
    ponerOcultoScroll(false);
  }, [pathname, ponerOcultoScroll]);
  useEffect(() => {
    if (bocadilloVisible) ponerOcultoScroll(false);
  }, [bocadilloVisible, ponerOcultoScroll]);

  // Ocultar: se desliza hacia su borde y se desvanece; al volver, con un leve rebote.
  const oculto = ocultoScroll && !panelOpen && !bocadilloVisible && !saludando;
  useEffect(() => {
    Animated.timing(ocultar, {
      toValue: oculto ? 1 : 0,
      duration: oculto ? 220 : 280,
      easing: oculto ? Easing.in(Easing.cubic) : Easing.out(Easing.back(1.3)),
      useNativeDriver: USA_NATIVO,
    }).start();
  }, [oculto, ocultar]);

  // --- arrastrar / tocar --------------------------------------------------------
  const totalRef = useRef(0);
  totalRef.current = totalCount;

  const openPanel = useCallback((tab?: "blue" | "avisos" | "noticias") => {
    setBocadillo(null);
    setSaludando(false);
    // Si hay notificaciones pendientes, se abre directamente en esa pestaña.
    setPestana(tab ?? (totalRef.current > 0 ? "avisos" : "blue"));
    setPanelOpen(true);
    refreshChats();
    refreshLikes();
    refreshNovedades();
    refreshNoticiasNuevas();
  }, [refreshChats, refreshLikes, refreshNovedades, refreshNoticiasNuevas]);

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

  // Antes de los 10 s (o en un chat) Blue no existe en pantalla.
  if (!ready || enChat || !aparecido) return null;

  const derecha = corner === "tr" || corner === "br";
  const arriba = corner === "tl" || corner === "tr";

  // Capa visible: fundido de entrada × fundido al ocultarse, y deslizamiento
  // hacia su borde. Cuerpo: rebote de escala y giro del saludo.
  const opacidadCapa = Animated.multiply(
    entrada.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
    ocultar.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: "clamp" })
  );
  const deslizCapa = ocultar.interpolate({ inputRange: [0, 1], outputRange: [0, derecha ? DESLIZ_OCULTO : -DESLIZ_OCULTO] });
  const escalaCuerpo = entrada.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const giroSaludo = saludo.interpolate({ inputRange: [-1, 1], outputRange: ["-14deg", "14deg"] });

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
          // Oculto por scroll: no bloquea los toques de lo que haya debajo.
          pointerEvents: oculto ? "none" : "box-none",
        }}
      >
        <Animated.View
          style={{
            width: BLUE_SIZE,
            height: BLUE_SIZE,
            opacity: opacidadCapa,
            transform: [{ translateX: deslizCapa }],
            pointerEvents: "box-none",
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
          ) : saludando ? (
            // Mini saludo al aparecer (al tocarlo, abre el panel de Blue).
            <Animated.View
              style={{
                position: "absolute",
                width: 176,
                alignItems: derecha ? "flex-end" : "flex-start",
                [derecha ? "right" : "left"]: 4,
                [arriba ? "top" : "bottom"]: BLUE_SIZE + 4,
                opacity: chipAnim,
                transform: [{ scale: chipAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
                pointerEvents: "box-none",
              }}
            >
              <Pressable
                onPress={() => openPanel()}
                accessibilityRole="button"
                accessibilityLabel="Hola, soy Blue. Abrir el asistente"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: COLORS.bg,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  shadowColor: "#0B2138",
                  shadowOpacity: 0.12,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 5 },
                  elevation: 8,
                }}
              >
                <Ionicons name="hand-left-outline" size={15} color={COLORS.accent} />
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}>
                  ¡Hola! Soy <Text style={{ color: COLORS.accentDark }}>Blue</Text>
                </Text>
              </Pressable>
            </Animated.View>
          ) : null}

          {/* Cuerpo de Blue: se arrastra y se toca como siempre. */}
          <Animated.View style={{ width: BLUE_SIZE, height: BLUE_SIZE, transform: [{ scale: escalaCuerpo }, { rotate: giroSaludo }] }}>
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
        </Animated.View>
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
                    {noticiasNuevas > 0 ? (
                      <Aviso
                        titulo={noticiasNuevas === 1 ? "Hay 1 noticia nueva" : `Hay ${noticiasNuevas} noticias nuevas`}
                        accion="Ver noticias"
                        onPress={() => ir("/chat-global?tab=news")}
                      />
                    ) : null}
                  </>
                )}
                {/* Sin avisos de noticias activados: cómo activarlos. */}
                {!avisosNoticias ? (
                  <Text style={{ color: COLORS.muted, fontSize: 12, textAlign: "center", lineHeight: 17 }}>
                    ¿Quieres avisos de noticias?{" "}
                    <Text
                      onPress={() => ir("/chat-global?tab=news")}
                      accessibilityRole="link"
                      style={{ color: COLORS.accent, fontWeight: "800" }}
                    >
                      Actívalos con la campana de Noticias Gaming.
                    </Text>
                  </Text>
                ) : null}
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
