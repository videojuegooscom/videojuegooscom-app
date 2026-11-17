/**
 * Archivo: components/foro/NoticiasForo.tsx
 * Función: pestaña «Noticias Gaming» del Foro: lista de noticias resumidas con su carrusel de fotos, «me gusta»,
 *          comentarios, compartir, la mini tarjeta que se ve en el Foro y la campana de avisos de noticias.
 * Para qué sirve: lo que antes estaba al final de app/(tabs)/chat-global.tsx (NoticiasGamingPanel, TarjetaNoticia,
 *          CarruselNoticia, FotoNoticia, ComentariosNoticia, MenuCompartirNoticia, TarjetaNoticiaForo y
 *          AvisosNoticiasModal). Se separó en la tanda 6 de «ordenar el proyecto» (2026-11-17) sin cambiar nada.
 * Conectado con: lib/supabase.ts (noticias_gaming, noticias_likes, noticias_comentarios, preferencias_usuario),
 *          api/noticias-gaming.ts, lib/analiticaPropia.ts, lib/estadoCarga.ts, constants/temaTienda.ts,
 *          components/foro/PiezasForo.tsx, components/PerfilPublico.tsx, components/marca/*; app/noticias/[id].tsx (enlaces).
 * Utilizado por: app/(tabs)/chat-global.tsx (pestaña Noticias, mini tarjeta en el Foro y campana).
 * Dependencias: react, react-native, expo-router, expo-image, expo-linear-gradient, @expo/vector-icons,
 *          @react-native-async-storage/async-storage.
 * Estado: ACTIVO
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Link, router, useFocusEffect, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Image, LayoutAnimation, Modal, PixelRatio, Platform, Pressable, ScrollView, Share, Switch, Text, TextInput, useWindowDimensions, View, type ViewStyle } from "react-native";
import CargaMarca from "../marca/CargaMarca";
import MarcaAnimada from "../marca/MarcaAnimada";
import { perfilesPublicos, type PerfilForo } from "../PerfilPublico";
import { CAMPO, TACTIL, TAMANOS } from "../../constants/temaTienda";
import { marcarFinCarga, marcarInicioCarga } from "../../lib/estadoCarga";
import { supabase } from "../../lib/supabase";
import { AvatarCircle, COLORS, ConfirmarEliminar, EnlaceNormasForo, NOTICIAS_VISTAS_KEY, faltaTabla, guardarPreferencias, nombreVisibleForo, useEsAdminForo } from "./PiezasForo";

// Se pone a false en cuanto se detecta que la tabla noticias_comentarios no existe.
let tablaComentariosDisponible = true;

// --- Pestaña "Noticias Gaming" ----------------------------------------------
// Lee las noticias ya resumidas de la tabla noticias_gaming (lectura pública)
// y, en segundo plano, pide a api/noticias-gaming.ts que busque nuevas si
// toca (la propia función decide si han pasado 3 horas). Si la tabla aún no
// existe o falla algo, se muestra el estado vacío, nunca un error.

const NOTICIAS_POR_PAGINA = 20;
const NOTICIAS_API_URL =
  Platform.OS === "web" ? "/api/noticias-gaming" : "https://videojuegoszaragoza.com/api/noticias-gaming";
const AZUL_NOTICIAS = "#1EA7E8";
const AZUL_OSCURO_NOTICIAS = "#1EA7E8";
const COLUMNAS_NOTICIA =
  "id,fuente,titulo,imagen_url,categoria,resumen,puntos_clave,datos,por_que_importa,afecta_a,publicada_en,created_at";
// Si la columna «imagenes» aún no existe en la base de datos, se deja de pedir.
let columnaImagenesDisponible = true;
// Igual con «imagenes_meta» (sin ella, las fotos se miden con Image.getSize).
let columnaMetaDisponible = true;
// Igual con «me_gusta» (total de me gusta; sin ella el corazón no cuenta).
let columnaMeGustaDisponible = true;
// Tabla noticias_likes (migración 20261014110000); false si aún no existe.
let tablaLikesDisponible = true;

// Columnas de una noticia, con las opcionales que existan.
function columnasNoticia(): string {
  let columnas = COLUMNAS_NOTICIA;
  if (columnaImagenesDisponible) {
    columnas += `,imagenes,imagenes_verificadas${columnaMetaDisponible ? ",imagenes_meta" : ""}`;
  }
  if (columnaMeGustaDisponible) columnas += ",me_gusta";
  return columnas;
}

// Lee con las columnas opcionales; si el error dice que falta alguna, la deja
// de pedir y lo reintenta (me_gusta, imagenes_meta y luego imagenes).
async function leerConColumnasOpcionales<R extends { error: { message?: string } | null }>(
  consulta: (columnas: string) => PromiseLike<R>
): Promise<R> {
  let r = await consulta(columnasNoticia());
  for (let i = 0; i < 3 && r.error; i++) {
    const mensaje = r.error.message ?? "";
    if (columnaMeGustaDisponible && /me_gusta/i.test(mensaje)) {
      columnaMeGustaDisponible = false;
    } else if (columnaImagenesDisponible && columnaMetaDisponible && /imagenes_meta/i.test(mensaje)) {
      columnaMetaDisponible = false;
    } else if (columnaImagenesDisponible && /imagenes/i.test(mensaje)) {
      columnaImagenesDisponible = false;
    } else {
      break;
    }
    r = await consulta(columnasNoticia());
  }
  return r;
}

// Ancho y alto reales de una foto (de imagenes_meta).
type MedidaFoto = { w: number; h: number };

export type Noticia = {
  id: string;
  fuente: string;
  titulo: string;
  imagenes: string[];
  // Medidas de cada foto por URL (imagenes_meta); las que faltan se miden con getSize.
  medidas: Record<string, MedidaFoto>;
  categoria: string;
  resumen: string;
  puntosClave: string[];
  datos: string[];
  porQueImporta: string | null;
  afectaA: string | null;
  publicadaEn: string | null;
  // created_at real: sirve para «noticias vistas hasta».
  creadaEn: string | null;
  // Total de me gusta (noticias_gaming.me_gusta); null = columna aún no disponible.
  meGusta: number | null;
};

// Lo justo para la mini tarjeta de una noticia compartida en el Foro.
export type NoticiaMini = { id: string; titulo: string; categoria: string; imagen: string | null };

function aListaDeTextos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string" && !!v.trim()) : [];
}

// Imagen principal + carrusel, sin repetidas y solo https (máx. 6).
function imagenesDeFila(r: any): string[] {
  // Solo fotos comprobadas por el servidor (sin la columna imagenes_verificadas, ninguna).
  const todas: unknown[] = r.imagenes_verificadas === true ? [r.imagen_url, ...(Array.isArray(r.imagenes) ? r.imagenes : [])] : [];
  const salida: string[] = [];
  for (const u of todas) {
    if (typeof u === "string" && /^https:\/\//i.test(u) && !salida.includes(u)) salida.push(u);
  }
  return salida.slice(0, 6);
}

// Medidas válidas de imagenes_meta ([{url, w, h}]), por URL.
function medidasDeFila(r: any): Record<string, MedidaFoto> {
  const salida: Record<string, MedidaFoto> = {};
  if (!Array.isArray(r.imagenes_meta)) return salida;
  for (const m of r.imagenes_meta) {
    const w = Number(m?.w);
    const h = Number(m?.h);
    if (typeof m?.url === "string" && w > 0 && h > 0) salida[m.url] = { w, h };
  }
  return salida;
}

function filaANoticia(r: any): Noticia {
  return {
    id: String(r.id),
    fuente: String(r.fuente ?? ""),
    titulo: String(r.titulo ?? ""),
    imagenes: imagenesDeFila(r),
    medidas: medidasDeFila(r),
    categoria: String(r.categoria ?? "Gaming"),
    resumen: String(r.resumen ?? ""),
    puntosClave: aListaDeTextos(r.puntos_clave),
    datos: aListaDeTextos(r.datos),
    porQueImporta: r.por_que_importa ?? null,
    afectaA: r.afecta_a ?? null,
    publicadaEn: r.publicada_en ?? r.created_at ?? null,
    creadaEn: r.created_at ?? null,
    meGusta: Number.isFinite(Number(r.me_gusta)) && r.me_gusta != null ? Math.max(0, Number(r.me_gusta)) : null,
  };
}

// Datos de varias noticias por id (para las mini tarjetas del Foro).
// Devuelve null si falla la lectura (se reintenta más tarde).
export async function leerNoticiasMini(ids: string[]): Promise<Record<string, NoticiaMini> | null> {
  const basicas = "id,titulo,categoria,imagen_url";
  const consulta = (columnas: string) =>
    supabase.from("noticias_gaming").select(columnas).in("id", ids).eq("publicada", true);

  let { data, error } = await consulta(columnaImagenesDisponible ? `${basicas},imagenes,imagenes_verificadas` : basicas);
  if (error && columnaImagenesDisponible && /imagenes/i.test(error.message ?? "")) {
    columnaImagenesDisponible = false;
    ({ data, error } = await consulta(basicas));
  }
  if (error) return null;

  const mapa: Record<string, NoticiaMini> = {};
  for (const r of (data ?? []) as any[]) {
    mapa[String(r.id).toLowerCase()] = {
      id: String(r.id),
      titulo: String(r.titulo ?? ""),
      categoria: String(r.categoria ?? "Gaming"),
      imagen: imagenesDeFila(r)[0] ?? null,
    };
  }
  return mapa;
}

// "hace 5 min", "hace 3 horas", "hace 2 días" o la fecha si es más antigua.
function haceTiempo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const min = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return horas === 1 ? "hace 1 hora" : `hace ${horas} horas`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function fechaLarga(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

// Enlace a la noticia dentro de la tienda (no a la fuente original): su página propia (app/noticias/[id].tsx), que
// Google puede indexar. Los enlaces antiguos /chat-global?tab=news&noticia=<id> siguen abriendo la noticia aquí.
const URL_NOTICIA_TIENDA = "https://videojuegoszaragoza.com/noticias/";

// «Compartir fuera»: hoja nativa, navigator.share o, si no hay, copiar el enlace.
async function compartirFuera(n: Noticia): Promise<"compartido" | "copiado" | "nada"> {
  const enlace = `${URL_NOTICIA_TIENDA}${n.id}`;
  const nav: any = typeof navigator !== "undefined" ? navigator : null;
  const copiar = async () => {
    if (!nav?.clipboard?.writeText) return "nada" as const;
    await nav.clipboard.writeText(enlace);
    return "copiado" as const;
  };

  try {
    if (Platform.OS === "web") {
      if (nav?.share) {
        try {
          await nav.share({ title: n.titulo, url: enlace });
          return "compartido";
        } catch (e: any) {
          // Cancelado por el usuario: nada más. Otro fallo: se copia el enlace.
          if (e?.name === "AbortError") return "nada";
          return await copiar();
        }
      }
      return await copiar();
    }
    await Share.share({ title: n.titulo, message: `${n.titulo}\n${enlace}`, url: enlace });
    return "compartido";
  } catch {
    return "nada";
  }
}

// Una noticia suelta (p. ej. una antigua que llega por enlace y no está en la primera página).
async function leerNoticiaPorId(id: string): Promise<Noticia | null> {
  const consulta = (columnas: string) =>
    supabase.from("noticias_gaming").select(columnas).eq("id", id).eq("publicada", true).maybeSingle();

  // Sin imagenes_meta o sin imagenes (migraciones pendientes) se reintenta sin ellas.
  const { data, error } = await leerConColumnasOpcionales(consulta);
  return !error && data ? filaANoticia(data) : null;
}

// La fecha (created_at, tal cual llega) de la noticia más reciente de la lista.
function creadaMasReciente(noticias: Noticia[]): string {
  let mejor = "";
  let mejorT = -Infinity;
  for (const n of noticias) {
    if (!n.creadaEn) continue;
    const t = Date.parse(n.creadaEn);
    const valor = Number.isNaN(t) ? -Infinity : t;
    if (valor > mejorT || (valor === mejorT && n.creadaEn > mejor)) {
      mejor = n.creadaEn;
      mejorT = valor;
    }
  }
  return mejor;
}

export function NoticiasGamingPanel({
  userId,
  noticiaPedida,
  onNoticiaAtendida,
  onDesplazarA,
  onCompartirEnForo,
}: {
  userId: string | null;
  // Noticia a desplegar y mostrar (enlace ?noticia= o mini tarjeta del Foro).
  noticiaPedida: string | null;
  onNoticiaAtendida: () => void;
  onDesplazarA: (y: number) => void;
  onCompartirEnForo: (n: Noticia) => Promise<boolean>;
}) {
  const { height } = useWindowDimensions();
  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  // Noticias con «me gusta» del usuario con sesión (de noticias_likes).
  const [misLikes, setMisLikes] = useState<Record<string, true>>({});
  const misLikesRef = useRef<Record<string, true>>({});
  // Noticias cuyo «me gusta» se está guardando (evita el doble toque).
  const guardandoLike = useRef<Set<string>>(new Set());
  // Noticias ya consultadas para este usuario (no se repite la consulta).
  const likesComprobados = useRef<{ usuario: string | null; ids: Set<string> }>({
    usuario: null,
    ids: new Set(),
  });
  // Nº de comentarios por noticia; null = función oculta (tabla aún no creada).
  const [comentarios, setComentarios] = useState<Record<string, number> | null>(null);
  const [aCompartir, setACompartir] = useState<Noticia | null>(null);
  const montado = useRef(true);
  // Posición (y) de cada tarjeta dentro del panel, para desplazarse a ella.
  const posiciones = useRef<Record<string, number>>({});
  const temporizadores = useRef<ReturnType<typeof setTimeout>[]>([]);
  const enfocado = useRef(false);
  const ultimaVista = useRef("");
  const abiertaIdRef = useRef<string | null>(null);
  // Cuántas noticias se han leído por páginas (sin contar una suelta abierta por enlace).
  const leidas = useRef(0);
  const isLoggedIn = !!userId;

  useEffect(() => {
    abiertaIdRef.current = abiertaId;
  }, [abiertaId]);

  // Página "desde" (0 = primera). Devuelve las noticias leídas.
  const leerPagina = useCallback(async (desde: number): Promise<Noticia[] | null> => {
    const consulta = (columnas: string) =>
      supabase
        .from("noticias_gaming")
        .select(columnas)
        .eq("publicada", true)
        .order("publicada_en", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(desde, desde + NOTICIAS_POR_PAGINA - 1);

    // Sin imagenes_meta o sin imagenes (migraciones pendientes) se reintenta sin ellas.
    let { data, error } = await leerConColumnasOpcionales(consulta);
    if (error && columnaImagenesDisponible) {
      // Otro fallo: un último intento solo con las columnas básicas.
      ({ data, error } = await consulta(COLUMNAS_NOTICIA));
    }
    if (error) return null;
    return ((data ?? []) as any[]).map(filaANoticia);
  }, []);

  // Cuenta los comentarios visibles de las noticias indicadas.
  const contarComentarios = useCallback(async (ids: string[]) => {
    if (!ids.length || !tablaComentariosDisponible) return;
    const { data, error } = await supabase
      .from("noticias_comentarios")
      .select("noticia_id")
      .in("noticia_id", ids)
      .eq("oculto", false)
      .limit(5000);
    if (!montado.current) return;
    if (error) {
      if (faltaTabla(error, "noticias_comentarios")) {
        tablaComentariosDisponible = false;
        setComentarios(null);
      }
      return;
    }
    setComentarios((prev) => {
      const next = { ...(prev ?? {}) };
      for (const id of ids) next[id] = 0;
      for (const r of (data ?? []) as { noticia_id: string }[]) {
        next[r.noticia_id] = (next[r.noticia_id] ?? 0) + 1;
      }
      return next;
    });
  }, []);

  const recargar = useCallback(async () => {
    const primera = await leerPagina(0);
    if (!montado.current) return;
    setNoticias((prev) => {
      const lista = primera ?? [];
      // Conserva una noticia antigua abierta por enlace que no esté en la primera página.
      const extra = prev.filter((p) => p.id === abiertaIdRef.current && !lista.some((n) => n.id === p.id));
      return [...extra, ...lista];
    });
    leidas.current = primera?.length ?? 0;
    setHayMas((primera?.length ?? 0) === NOTICIAS_POR_PAGINA);
    setCargando(false);
    if (primera?.length) contarComentarios(primera.map((n) => n.id));
  }, [leerPagina, contarComentarios]);

  useEffect(() => {
    montado.current = true;
    recargar();

    // En segundo plano: si la función trae noticias nuevas o rellena
    // imágenes de las que ya había, se recarga la lista.
    fetch(NOTICIAS_API_URL)
      .then((r) => r.json())
      .then((json: any) => {
        const nuevas = json?.actualizado ? Number(json?.nuevas) || 0 : 0;
        const rellenadas = Number(json?.rellenadas) || 0;
        if (montado.current && (nuevas > 0 || rellenadas > 0)) recargar();
      })
      .catch(() => {});

    const pendientes = temporizadores.current;
    return () => {
      montado.current = false;
      pendientes.forEach(clearTimeout);
    };
  }, [recargar]);

  const verMasNoticias = async () => {
    if (cargandoMas) return;
    setCargandoMas(true);
    const siguientes = await leerPagina(leidas.current);
    if (!montado.current) return;
    if (siguientes) {
      leidas.current += siguientes.length;
      setNoticias((prev) => {
        const vistos = new Set(prev.map((n) => n.id));
        return [...prev, ...siguientes.filter((n) => !vistos.has(n.id))];
      });
      setHayMas(siguientes.length === NOTICIAS_POR_PAGINA);
      contarComentarios(siguientes.map((n) => n.id));
    } else {
      setHayMas(false);
    }
    setCargandoMas(false);
  };

  // Despliega una noticia y se desplaza a ella. Dos intentos: el segundo
  // corrige si las fotos de las tarjetas de arriba cambiaron la altura.
  const desplegarYMostrar = useCallback(
    (id: string) => {
      setAbiertaId(id);
      temporizadores.current.forEach(clearTimeout);
      temporizadores.current.length = 0;
      for (const ms of [350, 1200]) {
        temporizadores.current.push(
          setTimeout(() => {
            const y = posiciones.current[id];
            if (montado.current && y != null) onDesplazarA(y);
          }, ms)
        );
      }
    },
    [onDesplazarA]
  );

  // Noticia pedida desde un enlace (?noticia=) o desde la mini tarjeta del Foro.
  useEffect(() => {
    if (!noticiaPedida || cargando) return;
    const id = noticiaPedida;
    onNoticiaAtendida();

    const yaEsta = noticias.find((n) => n.id.toLowerCase() === id);
    if (yaEsta) {
      desplegarYMostrar(yaEsta.id);
      return;
    }
    // No está en la primera página: se trae suelta y se pone arriba.
    leerNoticiaPorId(id).then((n) => {
      if (!n || !montado.current) return;
      setNoticias((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
      contarComentarios([n.id]);
      desplegarYMostrar(n.id);
    });
  }, [noticiaPedida, cargando, noticias, onNoticiaAtendida, desplegarYMostrar, contarComentarios]);

  // «Noticias vistas hasta»: cada vez que se ve esta pestaña se guarda la
  // fecha (created_at) de la noticia más reciente; siempre en el dispositivo
  // y, con sesión, también en preferencias_usuario. Blue la usa para contar
  // las noticias nuevas.
  const masReciente = useMemo(() => creadaMasReciente(noticias), [noticias]);
  // Las 2 primeras noticias con foto: su primera foto se descarga con prioridad alta.
  const prioritarias = useMemo(
    () => new Set(noticias.filter((n) => n.imagenes.length).slice(0, 2).map((n) => n.id)),
    [noticias]
  );
  const guardarVistas = useCallback(() => {
    if (!masReciente || !enfocado.current) return;
    const clave = `${userId ?? ""}|${masReciente}`;
    if (ultimaVista.current === clave) return;
    ultimaVista.current = clave;
    AsyncStorage.setItem(NOTICIAS_VISTAS_KEY, masReciente).catch(() => {});
    if (userId) guardarPreferencias(userId, { noticias_vistas_hasta: masReciente });
  }, [masReciente, userId]);

  useFocusEffect(
    useCallback(() => {
      enfocado.current = true;
      guardarVistas();
      return () => {
        enfocado.current = false;
      };
    }, [guardarVistas])
  );

  const guardarPosicion = useCallback((id: string, y: number) => {
    posiciones.current[id] = y;
  }, []);

  // +1 al comentar; -1 cuando un administrador elimina un comentario.
  const sumarComentario = useCallback((id: string, cambio = 1) => {
    setComentarios((prev) => (prev ? { ...prev, [id]: Math.max(0, (prev[id] ?? 0) + cambio) } : prev));
  }, []);

  const abrirCompartir = useCallback((n: Noticia) => setACompartir(n), []);

  const alternar = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAbiertaId((actual) => (actual === id ? null : id));
  }, []);

  // Cambia mis «me gusta» (ref al momento, estado para pintar).
  const fijarMisLikes = useCallback((mapa: Record<string, true>) => {
    misLikesRef.current = mapa;
    setMisLikes(mapa);
  }, []);

  // Marca/desmarca mi «me gusta» y mueve el contador «delta».
  const aplicarLike = useCallback(
    (id: string, conLike: boolean, delta: number) => {
      const mapa = { ...misLikesRef.current };
      if (conLike) mapa[id] = true;
      else delete mapa[id];
      fijarMisLikes(mapa);
      if (!delta) return;
      setNoticias((prev) =>
        prev.map((n) =>
          n.id === id && n.meGusta !== null ? { ...n, meGusta: Math.max(0, n.meGusta + delta) } : n
        )
      );
    },
    [fijarMisLikes]
  );

  // Con sesión: qué noticias cargadas tienen ya mi «me gusta».
  useEffect(() => {
    const comprobados = likesComprobados.current;
    if (comprobados.usuario !== userId) {
      likesComprobados.current = { usuario: userId, ids: new Set() };
      guardandoLike.current.clear();
      if (Object.keys(misLikesRef.current).length) fijarMisLikes({});
    }
    if (!userId || !tablaLikesDisponible) return;

    const vistos = likesComprobados.current.ids;
    const ids = noticias.map((n) => n.id).filter((id) => !vistos.has(id));
    if (!ids.length) return;
    ids.forEach((id) => vistos.add(id));

    const usuario = userId;
    supabase
      .from("noticias_likes")
      .select("noticia_id")
      .eq("user_id", usuario)
      .in("noticia_id", ids)
      .then(({ data, error }) => {
        if (!montado.current || likesComprobados.current.usuario !== usuario) return;
        if (error) {
          if (faltaTabla(error, "noticias_likes")) tablaLikesDisponible = false;
          // Otro fallo: se reintentará en la próxima carga.
          else ids.forEach((id) => vistos.delete(id));
          return;
        }
        const filas = (data ?? []) as { noticia_id: string }[];
        if (!filas.length) return;
        const mapa = { ...misLikesRef.current };
        for (const f of filas) mapa[f.noticia_id] = true;
        fijarMisLikes(mapa);
      });
  }, [userId, noticias, fijarMisLikes]);

  // Toque en el corazón (solo con sesión; sin ella la tarjeta muestra el aviso).
  const alternarLike = useCallback(
    async (id: string) => {
      if (!userId || !tablaLikesDisponible || guardandoLike.current.has(id)) return;
      guardandoLike.current.add(id);
      const teniaLike = !!misLikesRef.current[id];
      const usuario = userId;

      // Optimista: se pinta ya y se revierte si falla.
      aplicarLike(id, !teniaLike, teniaLike ? -1 : 1);
      const { error } = teniaLike
        ? await supabase.from("noticias_likes").delete().eq("noticia_id", id).eq("user_id", usuario)
        : await supabase.from("noticias_likes").insert({ noticia_id: id });
      guardandoLike.current.delete(id);
      if (!montado.current || likesComprobados.current.usuario !== usuario || !error) return;

      if (!teniaLike && error.code === "23505") {
        // Ya tenía «me gusta» (p. ej. desde otro dispositivo): ya estaba contado.
        aplicarLike(id, true, -1);
        return;
      }
      if (faltaTabla(error, "noticias_likes")) tablaLikesDisponible = false;
      aplicarLike(id, teniaLike, teniaLike ? 1 : -1);
    },
    [userId, aplicarLike]
  );

  if (cargando) {
    return (
      <View style={{ minHeight: Math.max(260, height - 320), alignItems: "center", justifyContent: "center" }}>
        <CargaMarca texto="Buscando noticias…" />
      </View>
    );
  }

  if (!noticias.length) {
    return (
      <View
        style={{
          minHeight: Math.max(260, height - 320),
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
        }}
      >
        <MarcaAnimada cual="tienda" ancho={140} />
        <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 22, fontSize: 15 }}>
          Todavía no hay noticias. Vuelve en un rato.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ width: "100%", alignItems: "center", gap: 18 }}>
      {noticias.map((n) => (
        <TarjetaNoticia
          key={n.id}
          noticia={n}
          prioritaria={prioritarias.has(n.id)}
          abierta={abiertaId === n.id}
          meGusta={!!misLikes[n.id]}
          numComentarios={comentarios ? comentarios[n.id] ?? 0 : undefined}
          isLoggedIn={isLoggedIn}
          onAlternar={alternar}
          onLike={alternarLike}
          onCompartir={abrirCompartir}
          onComentado={sumarComentario}
          onPosicion={guardarPosicion}
        />
      ))}

      <MenuCompartirNoticia
        noticia={aCompartir}
        isLoggedIn={isLoggedIn}
        onCerrar={() => setACompartir(null)}
        onCompartirEnForo={onCompartirEnForo}
      />

      {hayMas ? (
        <Pressable
          onPress={verMasNoticias}
          disabled={cargandoMas}
          style={({ pressed }) => ({
            opacity: pressed || cargandoMas ? 0.7 : 1,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: COLORS.accentBorder,
            paddingVertical: 10,
            paddingHorizontal: 22,
            marginTop: 4,
          })}
        >
          <Text style={{ color: AZUL_OSCURO_NOTICIAS, fontWeight: "800" }}>
            {cargandoMas ? "Cargando…" : "Ver más noticias"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const TarjetaNoticia = React.memo(function TarjetaNoticia({
  noticia: n,
  prioritaria,
  abierta,
  meGusta,
  numComentarios,
  isLoggedIn,
  onAlternar,
  onLike,
  onCompartir,
  onComentado,
  onPosicion,
}: {
  noticia: Noticia;
  // Una de las 2 primeras con foto: su primera foto va con prioridad alta.
  prioritaria: boolean;
  abierta: boolean;
  meGusta: boolean;
  // undefined = comentarios no disponibles (se oculta el botón).
  numComentarios?: number;
  isLoggedIn: boolean;
  onAlternar: (id: string) => void;
  onLike: (id: string) => void;
  onCompartir: (n: Noticia) => void;
  onComentado: (id: string, cambio?: number) => void;
  onPosicion: (id: string, y: number) => void;
}) {
  const [verComentarios, setVerComentarios] = useState(false);
  // Aviso «Inicia sesión para dar me gusta» (solo sin sesión).
  const [avisoLike, setAvisoLike] = useState(false);
  const meta =[n.fuente, haceTiempo(n.publicadaEn)].filter(Boolean).join(" · ");
  const origen = [n.fuente, fechaLarga(n.publicadaEn)].filter(Boolean).join(" · ");
  const hayComentarios = numComentarios !== undefined;

  const alternarComentarios = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setVerComentarios((v) => !v);
  };

  // Sin sesión no cuenta: se muestra (u oculta) el aviso para iniciar sesión.
  const pulsarLike = () => {
    if (!isLoggedIn) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setAvisoLike((v) => !v);
      return;
    }
    onLike(n.id);
  };

  return (
    <View
      onLayout={(e) => onPosicion(n.id, e.nativeEvent.layout.y)}
      style={{
        width: "100%",
        maxWidth: 680,
        backgroundColor: "#FFFFFF",
        borderRadius: 22,
        padding: 16,
        gap: 10,
        alignItems: "center",
        shadowColor: "#0B2138",
        shadowOpacity: 0.06,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
      }}
    >
      {n.imagenes.length ? (
        <CarruselNoticia imagenes={n.imagenes} medidas={n.medidas} titulo={n.titulo} prioritaria={prioritaria} />
      ) : null}

      <Text
        style={{
          color: COLORS.accentText,
          fontSize: TAMANOS.minimo,
          fontWeight: "900",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          textAlign: "center",
          marginTop: 2,
        }}
      >
        {n.categoria}
      </Text>

      <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "900", lineHeight: 24, textAlign: "center" }}>
        {n.titulo}
      </Text>

      {meta ? <Text style={{ color: COLORS.soft, fontSize: TAMANOS.minimo, textAlign: "center" }}>{meta}</Text> : null}

      {/* Resumen completo, siempre visible (sin cortar) */}
      {n.resumen ? (
        <Text style={[estiloTextoNoticia, { maxWidth: 560, marginTop: 2 }]}>{n.resumen}</Text>
      ) : null}

      {/* Su página propia (enlace de verdad, también para Google). */}
      <Link href={`/noticias/${n.id}` as Href} asChild>
        <Pressable
          nativeID={`abrir-noticia-${n.id}`}
          accessibilityRole="link"
          hitSlop={6}
          // Zona táctil de 44 px; el margen negativo mantiene la separación de antes en la tarjeta.
          style={{ minHeight: TACTIL.minimo, paddingHorizontal: 8, justifyContent: "center", marginVertical: -8 }}
        >
          <Text style={{ color: COLORS.accentText, fontSize: TAMANOS.minimo, fontWeight: "800", textAlign: "center" }}>Abrir la noticia</Text>
        </Pressable>
      </Link>

      {/* Resto del desglose: solo al pulsar «Ver más» */}
      {abierta ? (
        <View style={{ width: "100%", alignItems: "center", gap: 18, marginTop: 8 }}>
          {n.puntosClave.length ? (
            <SeccionNoticia titulo="Puntos clave">
              <ListaVinetas items={n.puntosClave} />
            </SeccionNoticia>
          ) : null}

          {n.datos.length ? (
            <SeccionNoticia titulo="Datos concretos">
              <ListaVinetas items={n.datos} />
            </SeccionNoticia>
          ) : null}

          {n.porQueImporta ? (
            <SeccionNoticia titulo="Por qué importa">
              <Text style={estiloTextoNoticia}>{n.porQueImporta}</Text>
            </SeccionNoticia>
          ) : null}

          <Text style={{ color: COLORS.soft, fontSize: TAMANOS.minimo, textAlign: "center", lineHeight: 18 }}>
            Redactado a partir del texto del artículo original{origen ? ` (${origen})` : ""}
          </Text>

          {n.afectaA ? (
            <SeccionNoticia titulo="Afecta a">
              <Text style={estiloTextoNoticia}>{n.afectaA}</Text>
            </SeccionNoticia>
          ) : null}
        </View>
      ) : null}

      {/* Acciones, siempre visibles y separadas por una línea fina */}
      <View
        style={{
          width: "100%",
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          paddingTop: 14,
          marginTop: 4,
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <BotonNoticia
          onPress={() => onAlternar(n.id)}
          etiqueta={abierta ? "Ver menos" : "Ver más"}
          icono={abierta ? "chevron-up" : "chevron-down"}
          iconoDetras
        />
        <BotonNoticia
          onPress={pulsarLike}
          etiqueta={String(n.meGusta ?? 0)}
          icono={meGusta ? "heart" : "heart-outline"}
          colorIcono={meGusta ? "#E0245E" : undefined}
          accesible={meGusta ? "Quitar me gusta" : "Me gusta"}
        />
        {hayComentarios ? (
          <BotonNoticia
            onPress={alternarComentarios}
            etiqueta={String(numComentarios)}
            icono="chatbubble-outline"
            accesible={verComentarios ? "Ocultar comentarios" : "Comentarios"}
            activo={verComentarios}
          />
        ) : null}
        <BotonNoticia onPress={() => onCompartir(n)} icono="share-social-outline" accesible="Compartir" />
      </View>

      {!isLoggedIn && avisoLike ? (
        <View style={{ alignItems: "center", gap: 10, paddingVertical: 4 }}>
          <Text style={{ color: COLORS.muted, textAlign: "center", fontSize: 14 }}>
            Inicia sesión para dar me gusta
          </Text>
          <Pressable
            onPress={() => router.push("/perfil?aviso=Inicia%20sesión%20para%20dar%20me%20gusta" as Href)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              minHeight: TACTIL.minimo,
              justifyContent: "center",
              borderRadius: 999,
              paddingVertical: 10,
              paddingHorizontal: 20,
              backgroundColor: AZUL_NOTICIAS,
            })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Iniciar sesión</Text>
          </Pressable>
        </View>
      ) : null}

      {hayComentarios && verComentarios ? (
        <ComentariosNoticia noticiaId={n.id} isLoggedIn={isLoggedIn} onComentado={onComentado} />
      ) : null}
    </View>
  );
});

// --- Carrusel de imágenes de una noticia ------------------------------------
// Paginado en horizontal, cada foto entera (contain, nunca recortada) en una
// caja con su proporción real y como mucho 320 px de alto. La proporción sale
// de imagenes_meta (al instante, sin descargar la foto); solo si falta se mide
// con Image.getSize, como antes. Las fotos que no cargan o son diminutas
// (iconos, píxeles) se descartan; si no queda ninguna, no se pinta nada (sin
// huecos). Solo se descarga la primera foto; las demás, cuando el carrusel
// llega a ellas (la siguiente se precarga 1,5 s antes de pasar). Pasa sola a
// la siguiente foto cada 5 s (en bucle), se pausa mientras se toca o arrastra
// y, si el sistema pide reducir movimiento, cambia de foto sin animación.

const ALTO_MAX_CARRUSEL = 320;
const PASO_CARRUSEL_MS = 5000;
const PRECARGA_ANTES_MS = 1500;

// «Reducir movimiento» del sistema. Una sola suscripción para todos los
// carruseles (en web, varios oyentes con el mismo código se pisan entre sí).
let reducirMovimientoActual = false;
let reducirMovimientoIniciado = false;
const oyentesMovimiento = new Set<(valor: boolean) => void>();

function iniciarReducirMovimiento() {
  if (reducirMovimientoIniciado) return;
  reducirMovimientoIniciado = true;
  const avisar = (valor: boolean) => {
    reducirMovimientoActual = !!valor;
    oyentesMovimiento.forEach((f) => f(reducirMovimientoActual));
  };
  AccessibilityInfo.isReduceMotionEnabled().then(avisar).catch(() => {});
  AccessibilityInfo.addEventListener("reduceMotionChanged", avisar);
}

function useReducirMovimiento() {
  const [reducir, setReducir] = useState(reducirMovimientoActual);
  useEffect(() => {
    iniciarReducirMovimiento();
    oyentesMovimiento.add(setReducir);
    setReducir(reducirMovimientoActual);
    return () => {
      oyentesMovimiento.delete(setReducir);
    };
  }, []);
  return reducir;
}

// Proporción (ancho/alto) de una foto; 0 = diminuta (icono o píxel de
// seguimiento): se descarta.
function proporcionDe(w: number, h: number): number {
  return w >= 160 && h >= 90 ? w / h : 0;
}

// Proporciones ya conocidas por imagenes_meta. claveMedidas lleva «WxH» (o
// nada) por cada URL de clave, en el mismo orden.
function proporcionesConocidas(clave: string, claveMedidas: string): Record<string, number> {
  const salida: Record<string, number> = {};
  if (!clave) return salida;
  const tamanos = claveMedidas.split("\n");
  clave.split("\n").forEach((uri, i) => {
    const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(tamanos[i] ?? "");
    if (m) salida[uri] = proporcionDe(Number(m[1]), Number(m[2]));
  });
  return salida;
}

function CarruselNoticia({
  imagenes,
  medidas,
  titulo,
  prioritaria,
}: {
  imagenes: string[];
  medidas: Record<string, MedidaFoto>;
  titulo: string;
  prioritaria: boolean;
}) {
  const clave = imagenes.join("\n");
  const claveMedidas = imagenes.map((u) => (medidas[u] ? `${medidas[u].w}x${medidas[u].h}` : "")).join("\n");
  const [ancho, setAncho] = useState(0);
  const [proporciones, setProporciones] = useState<Record<string, number>>(() =>
    proporcionesConocidas(clave, claveMedidas)
  );
  const [pagina, setPagina] = useState(0);
  // Hasta qué foto ha llegado el carrusel: las de después aún no se descargan.
  const [alcanzada, setAlcanzada] = useState(0);
  // Sube al soltar el carrusel: vuelve a contar los 5 s desde ese momento.
  const [reinicio, setReinicio] = useState(0);
  const tocando = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const reducirMovimiento = useReducirMovimiento();

  // Proporción de cada foto: la de imagenes_meta y, solo si falta, Image.getSize.
  useEffect(() => {
    let vivo = true;
    const lista = clave ? clave.split("\n") : [];
    const conocidas = proporcionesConocidas(clave, claveMedidas);
    setProporciones((prev) => {
      const next = { ...conocidas };
      for (const uri of lista) if (!(uri in next) && uri in prev) next[uri] = prev[uri];
      return next;
    });
    for (const uri of lista) {
      if (uri in conocidas) continue;
      Image.getSize(
        uri,
        (w, h) => {
          if (vivo) setProporciones((prev) => ({ ...prev, [uri]: proporcionDe(w, h) }));
        },
        () => {
          if (vivo) setProporciones((prev) => ({ ...prev, [uri]: 0 }));
        }
      );
    }
    return () => {
      vivo = false;
    };
  }, [clave, claveMedidas]);

  // Una foto que no carga (ni la optimizada ni la original) se quita del carrusel.
  const descartar = useCallback((uri: string) => {
    setProporciones((prev) => ({ ...prev, [uri]: 0 }));
  }, []);

  const listas = imagenes.filter((u) => (proporciones[u] ?? 0) > 0);
  const total = listas.length;
  const actual = Math.min(pagina, Math.max(0, total - 1));

  // Caja de cada foto: todo el ancho, salvo si pasaría de 320 px de alto.
  const caja = (uri: string) => {
    const r = proporciones[uri];
    let w = ancho;
    let h = ancho / r;
    if (h > ALTO_MAX_CARRUSEL) {
      h = ALTO_MAX_CARRUSEL;
      w = ALTO_MAX_CARRUSEL * r;
    }
    return { w: Math.round(w), h: Math.round(h) };
  };

  // Foto que toca después, si aún no se ha descargado: se precarga antes de pasar.
  const siguienteIndice = total > 1 ? (actual + 1) % total : -1;
  const precargar =
    ancho > 0 && siguienteIndice > alcanzada
      ? urlFotoNoticia(listas[siguienteIndice], anchoOptimizado(caja(listas[siguienteIndice]).w))
      : "";

  // Avance automático: cada 5 s a la siguiente (y de la última a la primera).
  // Mientras se toca no avanza; al soltar se vuelve a contar desde cero.
  useEffect(() => {
    if (total < 2 || !ancho) return;
    const tPrecarga = precargar
      ? setTimeout(() => {
          ExpoImage.prefetch(precargar, "memory-disk").catch(() => {});
        }, PASO_CARRUSEL_MS - PRECARGA_ANTES_MS)
      : undefined;
    const t = setTimeout(() => {
      if (tocando.current) return;
      const siguiente = (actual + 1) % total;
      setAlcanzada((a) => Math.max(a, siguiente));
      scrollRef.current?.scrollTo({ x: siguiente * ancho, animated: !reducirMovimiento });
      setPagina(siguiente);
    }, PASO_CARRUSEL_MS);
    return () => {
      clearTimeout(t);
      if (tPrecarga) clearTimeout(tPrecarga);
    };
  }, [actual, total, ancho, reinicio, reducirMovimiento, precargar]);

  const pausar = () => {
    tocando.current = true;
  };
  const reanudar = () => {
    tocando.current = false;
    setReinicio((r) => r + 1);
  };

  if (!total) return null;

  const alto = ancho ? Math.max(...listas.map((u) => caja(u).h)) : 0;
  const varias = total > 1;

  const irA = (i: number) => {
    const destino = Math.max(0, Math.min(total - 1, i));
    setAlcanzada((a) => Math.max(a, destino));
    scrollRef.current?.scrollTo({ x: destino * ancho, animated: !reducirMovimiento });
    setPagina(destino);
  };

  return (
    <View
      style={{ width: "100%", alignItems: "center", gap: 10, marginBottom: 4 }}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w && w !== ancho) setAncho(w);
      }}
    >
      {ancho > 0 ? (
        <View
          style={{ width: ancho, height: alto }}
          onTouchStart={pausar}
          onTouchEnd={reanudar}
          onTouchCancel={reanudar}
        >
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScrollBeginDrag={pausar}
            onMomentumScrollEnd={reanudar}
            onScroll={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              const i = Math.round(x / ancho);
              setPagina((prev) => (prev === i ? prev : i));
              // Al empezar a arrastrar hacia una foto, se empieza a descargar.
              const hasta = Math.min(total - 1, Math.ceil(x / ancho - 0.01));
              setAlcanzada((a) => (hasta > a ? hasta : a));
            }}
            style={{ width: ancho, height: alto }}
          >
            {listas.map((uri, i) => {
              const { w, h } = caja(uri);
              return (
                <View
                  key={uri}
                  style={{ width: ancho, height: alto, alignItems: "center", justifyContent: "center" }}
                >
                  <FotoNoticia
                    uri={uri}
                    anchoPedido={anchoOptimizado(w)}
                    estiloCaja={{ width: w, height: h, borderRadius: 16 }}
                    cargar={i <= alcanzada}
                    prioridad={i === 0 ? (prioritaria ? "high" : "normal") : "low"}
                    etiqueta={`Imagen ${i + 1} de ${listas.length}: ${titulo}`}
                    onFallo={descartar}
                  />
                </View>
              );
            })}
          </ScrollView>

          {/* En web (ratón) flechas para pasar de foto */}
          {varias && Platform.OS === "web" ? (
            <>
              {actual > 0 ? <FlechaCarrusel lado="izquierda" onPress={() => irA(actual - 1)} /> : null}
              {actual < listas.length - 1 ? (
                <FlechaCarrusel lado="derecha" onPress={() => irA(actual + 1)} />
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      {/* Puntos indicadores (también sirven para saltar a una foto) */}
      {varias ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {listas.map((uri, i) => (
            <Pressable
              key={uri}
              onPress={() => irA(i)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Ver imagen ${i + 1}`}
            >
              <View
                style={{
                  width: i === actual ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === actual ? AZUL_NOTICIAS : COLORS.accentBorder,
                }}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function FlechaCarrusel({ lado, onPress }: { lado: "izquierda" | "derecha"; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={lado === "izquierda" ? "Imagen anterior" : "Imagen siguiente"}
      style={({ pressed }) => ({
        position: "absolute",
        top: "50%",
        marginTop: -17,
        left: lado === "izquierda" ? 8 : undefined,
        right: lado === "derecha" ? 8 : undefined,
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.92)",
        opacity: pressed ? 0.7 : 1,
        shadowColor: "#0B2138",
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      })}
    >
      <Ionicons
        name={lado === "izquierda" ? "chevron-back" : "chevron-forward"}
        size={18}
        color={AZUL_OSCURO_NOTICIAS}
      />
    </Pressable>
  );
}

// --- Fotos de noticias: versión optimizada, hueco exacto y brillo de carga ---
// Las fotos del bucket «noticias» (las copia api/noticias-gaming.ts) se piden
// en web a la optimización de imágenes de Vercel (vercel.json → "images"):
// /_vercel/image?url=…&w=…&q=72, con el ancho de la lista más cercano al de la
// caja × densidad de píxeles (máx. 1280), en avif/webp si el navegador puede.
// Si falla (p. ej. en local, sin Vercel), se usa la URL original. Las fotos
// antiguas (web del periódico) y las de la app nativa se piden tal cual.

const RE_BUCKET_NOTICIAS =
  /^https:\/\/rgvyvaineyodyxzwootl\.supabase\.co\/storage\/v1\/object\/public\/noticias\//;
const ANCHOS_OPTIMIZADOS = [320, 480, 640, 960, 1280];
const FONDO_CARGA_FOTO = "#F1F6FB";
const FUNDIDO_FOTO_MS = 200;
// Si una foto nunca avisa de que terminó, la barra de carga global se cierra igual.
const AVISO_CARGA_MAX_MS = 20000;

// Ancho de la lista más cercano al de la caja en píxeles reales (máx. 1280).
function anchoOptimizado(anchoCaja: number): number {
  const objetivo = Math.min(1280, anchoCaja * (PixelRatio.get() || 1));
  let mejor = ANCHOS_OPTIMIZADOS[0];
  for (const a of ANCHOS_OPTIMIZADOS) {
    if (Math.abs(a - objetivo) <= Math.abs(mejor - objetivo)) mejor = a;
  }
  return mejor;
}

// URL que se pinta: la optimizada (solo en web y solo fotos de nuestro bucket) o la original.
function urlFotoNoticia(url: string, ancho: number): string {
  if (Platform.OS !== "web" || !RE_BUCKET_NOTICIAS.test(url)) return url;
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${ancho}&q=72`;
}

// Brillo de carga: una sola animación compartida por todos los huecos.
const brilloCarga = new Animated.Value(0);
let usosBrillo = 0;
let animacionBrillo: Animated.CompositeAnimation | null = null;

function useBrilloCarga(activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    usosBrillo++;
    if (!animacionBrillo) {
      brilloCarga.setValue(0);
      animacionBrillo = Animated.loop(
        Animated.timing(brilloCarga, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        })
      );
      animacionBrillo.start();
    }
    return () => {
      usosBrillo = Math.max(0, usosBrillo - 1);
      if (!usosBrillo && animacionBrillo) {
        animacionBrillo.stop();
        animacionBrillo = null;
      }
    };
  }, [activo]);
}

// Hueco gris azulado muy claro del tamaño exacto de la foto, con un brillo
// suave que lo cruza mientras carga (sin brillo si se pide reducir movimiento).
function HuecoFoto({ brillo }: { brillo: boolean }) {
  const [ancho, setAncho] = useState(0);
  useBrilloCarga(brillo && ancho > 0);
  const franja = Math.max(60, Math.round(ancho * 0.45));
  return (
    <View
      pointerEvents="none"
      onLayout={(e) => setAncho(Math.round(e.nativeEvent.layout.width))}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: FONDO_CARGA_FOTO,
        overflow: "hidden",
      }}
    >
      {brillo && ancho > 0 ? (
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: franja,
            transform: [
              { translateX: brilloCarga.interpolate({ inputRange: [0, 1], outputRange: [-franja, ancho] }) },
            ],
          }}
        >
          <LinearGradient
            colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.7)", "rgba(255,255,255,0)"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

// Avisa a la barra de carga global (lib/estadoCarga) mientras la foto se
// descarga, igual que ImagenInteligente.
function useAvisoCargaFoto(activo: boolean, clave: string) {
  useEffect(() => {
    if (!activo) return;
    let abierto = true;
    marcarInicioCarga();
    const cerrar = () => {
      if (!abierto) return;
      abierto = false;
      marcarFinCarga();
    };
    const t = setTimeout(cerrar, AVISO_CARGA_MAX_MS);
    return () => {
      clearTimeout(t);
      cerrar();
    };
  }, [activo, clave]);
}

// Una foto de noticia (entera, sin recortar) en una caja de tamaño fijo: hueco
// con brillo mientras carga, fundido corto al aparecer, caché en memoria y
// disco, versión optimizada en web y, si falla, la URL original; si también
// falla, avisa con onFallo. cargar = false: solo el hueco (aún no se descarga).
function FotoNoticia({
  uri,
  anchoPedido,
  estiloCaja,
  cargar = true,
  prioridad = "normal",
  etiqueta,
  onFallo,
}: {
  uri: string;
  // Ancho que se pide a la optimización (uno de ANCHOS_OPTIMIZADOS).
  anchoPedido: number;
  estiloCaja: ViewStyle;
  cargar?: boolean;
  prioridad?: "low" | "normal" | "high";
  etiqueta: string;
  onFallo?: (uri: string) => void;
}) {
  const reducirMovimiento = useReducirMovimiento();
  const [original, setOriginal] = useState(false);
  const [estado, setEstado] = useState<"cargando" | "fundido" | "lista" | "fallida">("cargando");
  const fuente = original ? uri : urlFotoNoticia(uri, anchoPedido);
  const cargando = cargar && estado === "cargando";
  useAvisoCargaFoto(cargando, fuente);

  // Tras el fundido se quita el hueco (por si la foto tiene transparencias).
  useEffect(() => {
    if (estado !== "fundido") return;
    const t = setTimeout(() => setEstado("lista"), FUNDIDO_FOTO_MS + 80);
    return () => clearTimeout(t);
  }, [estado]);

  return (
    <View style={[{ overflow: "hidden", backgroundColor: "#FFFFFF" }, estiloCaja]}>
      {estado !== "lista" ? <HuecoFoto brillo={cargando && !reducirMovimiento} /> : null}
      {cargar && estado !== "fallida" ? (
        <ExpoImage
          source={{ uri: fuente }}
          style={{ width: "100%", height: "100%" }}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={reducirMovimiento ? 0 : FUNDIDO_FOTO_MS}
          priority={prioridad}
          recyclingKey={fuente}
          accessibilityLabel={etiqueta}
          onLoad={() => setEstado((e) => (e === "cargando" ? "fundido" : e))}
          onError={() => {
            // La optimizada falla: se prueba con la original.
            if (!original && fuente !== uri) {
              setOriginal(true);
              return;
            }
            setEstado("fallida");
            onFallo?.(uri);
          }}
        />
      ) : null}
    </View>
  );
}

const estiloTextoNoticia = {
  color: COLORS.text,
  fontSize: 15,
  lineHeight: 23,
  textAlign: "center" as const,
};

function SeccionNoticia({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={{ width: "100%", maxWidth: 560, alignItems: "center", gap: 8 }}>
      <Text
        style={{
          color: COLORS.accentText,
          fontSize: TAMANOS.minimo,
          fontWeight: "900",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
        {titulo}
      </Text>
      {children}
    </View>
  );
}

function ListaVinetas({ items }: { items: string[] }) {
  return (
    <View style={{ alignItems: "center", gap: 8, width: "100%" }}>
      {items.map((t, i) => (
        <View key={`${i}-${t.slice(0, 12)}`} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, maxWidth: "100%" }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: AZUL_NOTICIAS, marginTop: 9 }} />
          <Text style={[estiloTextoNoticia, { flexShrink: 1 }]}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function BotonNoticia({
  onPress,
  etiqueta,
  icono,
  colorIcono,
  iconoDetras,
  accesible,
  activo,
}: {
  onPress: () => void;
  etiqueta?: string;
  icono: React.ComponentProps<typeof Ionicons>["name"];
  colorIcono?: string;
  iconoDetras?: boolean;
  accesible?: string;
  // Resaltado suave (p. ej. comentarios abiertos).
  activo?: boolean;
}) {
  const icon = <Ionicons name={icono} size={15} color={colorIcono ?? AZUL_OSCURO_NOTICIAS} />;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accesible ?? etiqueta}
      accessibilityState={activo === undefined ? undefined : { expanded: activo }}
      style={({ pressed }) => ({
        opacity: pressed ? 0.7 : 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.accentBorder,
        backgroundColor: activo ? COLORS.accentSoft : "transparent",
        minHeight: TACTIL.minimo,
        minWidth: TACTIL.minimo,
        justifyContent: "center",
        paddingVertical: 8,
        paddingHorizontal: 14,
      })}
    >
      {!iconoDetras ? icon : null}
      {etiqueta ? (
        <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>{etiqueta}</Text>
      ) : null}
      {iconoDetras ? icon : null}
    </Pressable>
  );
}

// --- Comentarios de una noticia ---------------------------------------------
// Se abren bajo la tarjeta. Leer es público (noticias_comentarios); escribir
// pide sesión. El autor es el mismo nombre visible que usa el Foro. Un
// administrador ve una papelera en cada comentario: lo elimina para todos
// (se marca oculto; la base de datos solo deja hacerlo a administradores).

type ComentarioNoticia = { id: string; created_at: string; autor: string; texto: string; user_id?: string | null };

const MAX_COMENTARIO = 1000;

function ComentariosNoticia({
  noticiaId,
  isLoggedIn,
  onComentado,
}: {
  noticiaId: string;
  isLoggedIn: boolean;
  onComentado: (id: string, cambio?: number) => void;
}) {
  const [lista, setLista] = useState<ComentarioNoticia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const vivo = useRef(true);
  const esAdmin = useEsAdminForo();
  const [aEliminar, setAEliminar] = useState<ComentarioNoticia | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const confirmarEliminar = async () => {
    if (!aEliminar || eliminando) return;
    setEliminando(true);
    setErrorEliminar(null);
    try {
      const { data, error: fallo } = await supabase
        .from("noticias_comentarios")
        .update({ oculto: true })
        .eq("id", aEliminar.id)
        .select("id");
      if (fallo) throw fallo;
      if (!Array.isArray(data) || data.length === 0) throw new Error("no borrado");
      if (!vivo.current) return;
      const id = aEliminar.id;
      setLista((prev) => prev.filter((c) => c.id !== id));
      onComentado(noticiaId, -1);
      setAEliminar(null);
    } catch (e) {
      console.error("Error eliminando el comentario:", e);
      if (vivo.current) setErrorEliminar("No se ha podido eliminar el comentario. Inténtalo de nuevo.");
    } finally {
      if (vivo.current) setEliminando(false);
    }
  };

  useEffect(() => {
    vivo.current = true;
    (async () => {
      const { data, error: fallo } = await supabase
        .from("noticias_comentarios")
        .select("id,created_at,autor,texto,user_id")
        .eq("noticia_id", noticiaId)
        .eq("oculto", false)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!vivo.current) return;
      if (fallo) setError("No se pudieron cargar los comentarios.");
      else setLista((data ?? []) as ComentarioNoticia[]);
      setCargando(false);
    })();
    return () => {
      vivo.current = false;
    };
  }, [noticiaId]);

  // Usuario y foto de «Mi perfil» de quien comenta (como en el Foro; sin ellos, su nombre y la inicial).
  const [perfilesComentarios, setPerfilesComentarios] = useState<Record<string, PerfilForo>>({});
  useEffect(() => {
    const ids = lista.map((c) => c.user_id).filter((id): id is string => Boolean(id));
    if (!ids.length) return;
    let sigue = true;
    perfilesPublicos(ids)
      .then((encontrados) => {
        if (sigue) setPerfilesComentarios(Object.fromEntries(encontrados));
      })
      .catch(() => {});
    return () => {
      sigue = false;
    };
  }, [lista]);

  const limpio = texto.trim();
  const puedeEnviar = limpio.length >= 1 && limpio.length <= MAX_COMENTARIO && !enviando;

  const enviar = async () => {
    if (!puedeEnviar) return;
    setEnviando(true);
    setError(null);
    try {
      const { data: sesion } = await supabase.auth.getSession();
      const user = sesion.session?.user;
      if (!user) {
        setError("Inicia sesión para comentar.");
        return;
      }
      const { data, error: fallo } = await supabase
        .from("noticias_comentarios")
        .insert({ noticia_id: noticiaId, autor: nombreVisibleForo(user), texto: limpio })
        .select("id,created_at,autor,texto,user_id")
        .single();
      if (fallo) throw fallo;
      if (!vivo.current) return;
      setLista((prev) => [...prev, data as ComentarioNoticia]);
      setTexto("");
      onComentado(noticiaId);
    } catch (e) {
      console.error("Error enviando el comentario:", e);
      // 42501 = la base de datos no lo deja: la persona está silenciada en el Foro.
      const silenciado = String((e as { code?: unknown } | null)?.code ?? "") === "42501";
      if (vivo.current) {
        setError(
          silenciado
            ? "Ahora mismo no puedes comentar: un administrador te ha silenciado en el Foro durante unos días."
            : "No se pudo enviar el comentario. Inténtalo de nuevo."
        );
      }
    } finally {
      if (vivo.current) setEnviando(false);
    }
  };

  return (
    <View style={{ width: "100%", maxWidth: 560, gap: 10, marginTop: 4 }}>
      <Text
        style={{
          color: COLORS.accentText,
          fontSize: TAMANOS.minimo,
          fontWeight: "900",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
        Comentarios
      </Text>

      {cargando ? (
        <ActivityIndicator color={AZUL_NOTICIAS} style={{ marginVertical: 8 }} />
      ) : lista.length === 0 && !error ? (
        <Text style={{ color: COLORS.muted, textAlign: "center", fontSize: 14 }}>
          Todavía no hay comentarios. ¡Sé el primero!
        </Text>
      ) : (
        lista.map((c) => (
          <View
            key={c.id}
            style={{
              backgroundColor: COLORS.bg3,
              borderRadius: 16,
              paddingVertical: 10,
              paddingHorizontal: 14,
              gap: 4,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {(() => {
                const perfil = c.user_id ? perfilesComentarios[c.user_id] : undefined;
                const nombre = perfil?.usuario || c.autor;
                return (
                  <>
                    <AvatarCircle username={nombre} foto={perfil?.foto || undefined} size={26} />
                    <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: COLORS.soft, fontSize: TAMANOS.minimo }}>
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>{nombre}</Text>
                      {` · ${haceTiempo(c.created_at)}`}
                    </Text>
                  </>
                );
              })()}
              {esAdmin ? (
                <Pressable
                  onPress={() => {
                    setErrorEliminar(null);
                    setAEliminar(c);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Eliminar comentario"
                  hitSlop={8}
                  style={({ pressed }) => ({
                    width: TACTIL.minimo,
                    height: TACTIL.minimo,
                    marginVertical: -13,
                    borderRadius: TACTIL.minimo / 2,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: pressed ? "rgba(220,38,38,0.12)" : "transparent",
                  })}
                >
                  <Ionicons name="trash-outline" size={17} color="#DC2626" />
                </Pressable>
              ) : null}
            </View>
            <Text style={{ color: COLORS.text, fontSize: 15, lineHeight: 21 }}>{c.texto}</Text>
          </View>
        ))
      )}

      {aEliminar ? (
        <ConfirmarEliminar
          que="comentario"
          autor={aEliminar.autor}
          texto={aEliminar.texto}
          eliminando={eliminando}
          error={errorEliminar}
          onCancelar={() => {
            if (!eliminando) setAEliminar(null);
          }}
          onConfirmar={confirmarEliminar}
        />
      ) : null}

      {error ? (
        <Text style={{ color: "#B91C1C", fontSize: 13, fontWeight: "700", textAlign: "center" }}>
          {error}
        </Text>
      ) : null}
      {error && /silenciad/.test(error) ? <EnlaceNormasForo desde="comentarios" /> : null}

      {isLoggedIn ? (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder="Escribe un comentario…"
              placeholderTextColor="rgba(11,33,56,0.4)"
              maxLength={MAX_COMENTARIO}
              multiline
              editable={!enviando}
              accessibilityLabel="Escribe un comentario"
              style={{
                flex: 1,
                minHeight: CAMPO.alto,
                maxHeight: 120,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: "#FFFFFF",
                color: COLORS.text,
                // 16 px: evita el zoom automático de Safari en iOS.
                fontSize: 16,
                paddingHorizontal: 14,
                paddingVertical: 11,
              }}
            />
            <Pressable
              onPress={enviar}
              disabled={!puedeEnviar}
              accessibilityRole="button"
              accessibilityLabel="Enviar comentario"
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: puedeEnviar ? AZUL_NOTICIAS : "#DCE6EF",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {enviando ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Ionicons name="send" size={17} color={puedeEnviar ? "#FFFFFF" : "#8FA3B8"} />
              )}
            </Pressable>
          </View>
          {texto.length > MAX_COMENTARIO - 100 ? (
            <Text style={{ color: COLORS.soft, fontSize: TAMANOS.minimo, textAlign: "right" }}>
              {`${texto.length}/${MAX_COMENTARIO}`}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={{ alignItems: "center", gap: 10, paddingVertical: 4 }}>
          <Text style={{ color: COLORS.muted, textAlign: "center", fontSize: 14 }}>
            Inicia sesión para comentar
          </Text>
          <Pressable
            onPress={() => router.push("/perfil?aviso=Inicia%20sesión%20para%20comentar" as Href)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              minHeight: TACTIL.minimo,
              justifyContent: "center",
              borderRadius: 999,
              paddingVertical: 10,
              paddingHorizontal: 20,
              backgroundColor: AZUL_NOTICIAS,
            })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Iniciar sesión</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// --- Menú «Compartir» de una noticia ----------------------------------------
// Dos opciones: publicarla en el Foro (con sesión) o compartir el enlace a la
// noticia dentro de la tienda por otras apps.

function MenuCompartirNoticia({
  noticia,
  isLoggedIn,
  onCerrar,
  onCompartirEnForo,
}: {
  noticia: Noticia | null;
  isLoggedIn: boolean;
  onCerrar: () => void;
  onCompartirEnForo: (n: Noticia) => Promise<boolean>;
}) {
  const [enviando, setEnviando] = useState(false);
  const [nota, setNota] = useState<{ texto: string; bien: boolean } | null>(null);
  const cierre = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setEnviando(false);
    setNota(null);
  }, [noticia]);

  useEffect(
    () => () => {
      if (cierre.current) clearTimeout(cierre.current);
    },
    []
  );

  const alForo = async () => {
    if (!noticia || enviando) return;
    if (!isLoggedIn) {
      // Sin sesión: se cierra el menú y se pide iniciar sesión.
      onCerrar();
      onCompartirEnForo(noticia);
      return;
    }
    setEnviando(true);
    setNota(null);
    const ok = await onCompartirEnForo(noticia);
    // Si sale bien se abre el Foro y este menú desaparece con la pestaña.
    if (!ok) {
      setEnviando(false);
      setNota({ texto: "No se pudo compartir en el Foro. Inténtalo de nuevo.", bien: false });
    }
  };

  const alExterior = async () => {
    if (!noticia) return;
    const resultado = await compartirFuera(noticia);
    if (resultado === "copiado") {
      setNota({ texto: "Enlace copiado", bien: true });
      if (cierre.current) clearTimeout(cierre.current);
      cierre.current = setTimeout(onCerrar, 1200);
      return;
    }
    onCerrar();
  };

  return (
    <Modal transparent visible={!!noticia} animationType="fade" onRequestClose={onCerrar}>
      <Pressable
        onPress={onCerrar}
        style={{
          flex: 1,
          backgroundColor: COLORS.overlay,
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 380,
            backgroundColor: "#FFFFFF",
            borderRadius: 24,
            padding: 20,
            gap: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "900", textAlign: "center" }}>
            Compartir noticia
          </Text>
          {noticia ? (
            <Text
              numberOfLines={2}
              style={{ color: COLORS.muted, fontSize: 13, lineHeight: 18, textAlign: "center" }}
            >
              {noticia.titulo}
            </Text>
          ) : null}

          <OpcionMenu
            icono="chatbubbles-outline"
            texto="Compartir en el Foro"
            detalle={isLoggedIn ? "Para hablar de ella con la comunidad" : "Necesitas iniciar sesión"}
            onPress={alForo}
            cargando={enviando}
          />
          <OpcionMenu
            icono="share-outline"
            texto="Compartir fuera"
            detalle="Enviar el enlace por otras apps"
            onPress={alExterior}
          />

          {nota ? (
            <Text
              style={{
                color: nota.bien ? "#15803D" : "#B91C1C",
                fontSize: 13,
                fontWeight: "800",
                textAlign: "center",
              }}
            >
              {nota.texto}
            </Text>
          ) : null}

          <Pressable
            onPress={onCerrar}
            hitSlop={6}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, minHeight: TACTIL.minimo, justifyContent: "center", paddingVertical: 6, paddingHorizontal: 12 })}
          >
            <Text style={{ color: COLORS.muted, fontWeight: "800" }}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function OpcionMenu({
  icono,
  texto,
  detalle,
  onPress,
  cargando,
}: {
  icono: React.ComponentProps<typeof Ionicons>["name"];
  texto: string;
  detalle?: string;
  onPress: () => void;
  cargando?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={cargando}
      accessibilityRole="button"
      accessibilityLabel={texto}
      style={({ pressed }) => ({
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.accentBorder,
        backgroundColor: pressed ? COLORS.accentSoft : "#FFFFFF",
        paddingVertical: 12,
        paddingHorizontal: 14,
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: COLORS.accentSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {cargando ? (
          <ActivityIndicator color={AZUL_NOTICIAS} />
        ) : (
          <Ionicons name={icono} size={18} color={AZUL_OSCURO_NOTICIAS} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15 }}>{texto}</Text>
        {detalle ? (
          <Text style={{ color: COLORS.soft, fontSize: TAMANOS.minimo, marginTop: 2 }}>{detalle}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// --- Mini tarjeta de noticia dentro del Foro ---------------------------------
// Sustituye al texto crudo de los mensajes con [noticia:<id>]. «Leer noticia»
// abre Noticias Gaming con esa noticia desplegada. Mientras carga (o si ya no
// existe) se ve el texto del mensaje sin la marca.

export function TarjetaNoticiaForo({
  noticia,
  texto,
  onLeer,
}: {
  // undefined = cargando; null = ya no está disponible.
  noticia: NoticiaMini | null | undefined;
  texto: string;
  onLeer: () => void;
}) {
  // Foto que no carga (ni la pequeña optimizada ni la original): se quita.
  const [fotoFallida, setFotoFallida] = useState<string | null>(null);
  const boton = (
    <Pressable
      onPress={onLeer}
      accessibilityRole="button"
      accessibilityLabel="Leer noticia"
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        minHeight: TACTIL.minimo,
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: AZUL_NOTICIAS,
        alignSelf: "center",
      })}
    >
      <Ionicons name="newspaper-outline" size={14} color="#FFFFFF" />
      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13 }}>Leer noticia</Text>
    </Pressable>
  );

  if (!noticia) {
    return (
      <View style={{ gap: 8 }}>
        <Text style={{ color: COLORS.text, lineHeight: 22 }}>{texto || "📰 Noticia"}</Text>
        {noticia === null ? (
          <Text style={{ color: COLORS.soft, fontSize: TAMANOS.minimo }}>Esta noticia ya no está disponible.</Text>
        ) : (
          boton
        )}
      </View>
    );
  }

  return (
    <View
      style={{
        width: "100%",
        minWidth: 240,
        maxWidth: 380,
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: "hidden",
      }}
    >
      {noticia.imagen && noticia.imagen !== fotoFallida ? (
        // Versión pequeña (w=320): la tarjeta mide como mucho 380 px.
        <FotoNoticia
          key={noticia.imagen}
          uri={noticia.imagen}
          anchoPedido={320}
          estiloCaja={{ width: "100%", aspectRatio: 16 / 9 }}
          prioridad="low"
          etiqueta={noticia.titulo}
          onFallo={setFotoFallida}
        />
      ) : null}
      <View style={{ padding: 12, gap: 6, alignItems: "center" }}>
        <Text
          style={{
            color: COLORS.accentText,
            fontSize: TAMANOS.minimo,
            fontWeight: "900",
            letterSpacing: 1.1,
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          {noticia.categoria}
        </Text>
        <Text
          numberOfLines={3}
          style={{ color: COLORS.text, fontSize: 15, fontWeight: "900", lineHeight: 20, textAlign: "center" }}
        >
          {noticia.titulo}
        </Text>
        <View style={{ marginTop: 4 }}>{boton}</View>
      </View>
    </View>
  );
}

// --- Campana de Noticias Gaming: avisos y consentimiento comercial -----------
// Interruptor de avisos (para las notificaciones de Blue) y, aparte e
// independiente, la casilla de comunicaciones comerciales. Con sesión se
// guardan en preferencias_usuario; sin sesión los avisos van al dispositivo y
// la casilla pide iniciar sesión.

export function AvisosNoticiasModal({
  visible,
  onClose,
  isLoggedIn,
  avisos,
  marketing,
  marketingDisponible,
  onCambiarAvisos,
  onCambiarMarketing,
}: {
  visible: boolean;
  onClose: () => void;
  isLoggedIn: boolean;
  avisos: boolean;
  marketing: boolean;
  // false si la tabla preferencias_usuario aún no existe: se oculta la casilla.
  marketingDisponible: boolean;
  onCambiarAvisos: (valor: boolean) => Promise<boolean>;
  onCambiarMarketing: (valor: boolean) => Promise<boolean>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [pideSesion, setPideSesion] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setPideSesion(false);
  }, [visible]);

  const alternarAvisos = async (valor: boolean) => {
    setError(null);
    const ok = await onCambiarAvisos(valor);
    if (!ok) setError("No se pudo guardar. Inténtalo de nuevo.");
  };

  const alternarMarketing = async () => {
    if (!isLoggedIn) {
      setPideSesion(true);
      return;
    }
    if (guardando) return;
    setGuardando(true);
    setError(null);
    const ok = await onCambiarMarketing(!marketing);
    setGuardando(false);
    if (!ok) setError("No se pudo guardar. Inténtalo de nuevo.");
  };

  const irAIniciarSesion = () => {
    onClose();
    router.push("/perfil?aviso=Inicia%20sesión%20para%20recibir%20ofertas" as Href);
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: COLORS.overlay,
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 420,
            backgroundColor: "#FFFFFF",
            borderRadius: 24,
            padding: 22,
            gap: 16,
            alignItems: "center",
          }}
        >
          <Ionicons name={avisos ? "notifications" : "notifications-outline"} size={26} color={AZUL_NOTICIAS} />
          <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900", textAlign: "center" }}>
            Avisos de noticias
          </Text>

          <View style={{ width: "100%", flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15 }}>
                Avisarme de noticias nuevas
              </Text>
              <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }}>
                Aparecerán en las notificaciones de Blue, el asistente flotante.
              </Text>
            </View>
            <Switch
              value={avisos}
              onValueChange={alternarAvisos}
              trackColor={{ false: "#DCE6EF", true: AZUL_NOTICIAS }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#DCE6EF"
              accessibilityLabel="Avisarme de noticias nuevas"
            />
          </View>

          {marketingDisponible ? (
            <View
              style={{
                width: "100%",
                borderTopWidth: 1,
                borderTopColor: COLORS.border,
                paddingTop: 16,
                gap: 8,
              }}
            >
              <Pressable
                onPress={alternarMarketing}
                disabled={guardando}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: marketing, disabled: guardando }}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "flex-start",
                  minHeight: TACTIL.minimo,
                  gap: 10,
                  opacity: pressed || guardando ? 0.7 : 1,
                })}
              >
                <Ionicons
                  name={marketing ? "checkbox" : "square-outline"}
                  size={22}
                  color={AZUL_NOTICIAS}
                />
                <Text style={{ flex: 1, color: COLORS.text, fontSize: 14, lineHeight: 20 }}>
                  Acepto recibir ofertas y novedades comerciales de VideojuegosZaragoza.com
                </Text>
              </Pressable>
              <Text style={{ color: COLORS.soft, fontSize: TAMANOS.legal, marginLeft: 32 }}>
                Puedes retirarlo cuando quieras desde aquí
              </Text>

              {pideSesion ? (
                <View style={{ alignItems: "center", gap: 8, marginTop: 4 }}>
                  <Text style={{ color: COLORS.muted, fontSize: 13, textAlign: "center" }}>
                    Inicia sesión para aceptar las comunicaciones comerciales.
                  </Text>
                  <Pressable
                    onPress={irAIniciarSesion}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.85 : 1,
                      minHeight: TACTIL.minimo,
                      justifyContent: "center",
                      borderRadius: 999,
                      paddingVertical: 9,
                      paddingHorizontal: 18,
                      backgroundColor: AZUL_NOTICIAS,
                    })}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Iniciar sesión</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

          {error ? (
            <Text style={{ color: "#B91C1C", fontSize: 13, fontWeight: "700", textAlign: "center" }}>
              {error}
            </Text>
          ) : null}

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => ({
              opacity: pressed ? 0.9 : 1,
              minHeight: TACTIL.minimo,
              justifyContent: "center",
              borderRadius: 999,
              paddingVertical: 10,
              paddingHorizontal: 26,
              backgroundColor: AZUL_OSCURO_NOTICIAS,
            })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Listo</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
