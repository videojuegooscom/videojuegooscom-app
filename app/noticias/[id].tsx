/**
 * Archivo: app/noticias/[id].tsx
 * Función: pantalla de una noticia, en la dirección /noticias/<id>.
 * Para qué sirve: el cliente (y Google) lee una noticia de consolas y videojuegos con resumen, puntos clave, fuente y enlace para comentar en el Foro; pone su propio título y datos SEO en el head.
 * Conectado con: lib/supabase.ts (tabla noticias_gaming; la llena api/noticias-gaming.ts), lib/analiticaPropia.ts, components/EtiquetasCabeceraWeb.tsx (ponerEtiquetaMeta, ponerEnlaceCabecera), ImagenInteligente, CabeceraMarca, TirarParaActualizar y components/marca/*, app/servicio/[id].tsx (faltaColumna).
 * Utilizado por: Expo Router (dirección /noticias/<id>); la enlazan app/noticias/index.tsx (que además importa funciones de aquí) y app/(tabs)/chat-global.tsx (Foro).
 * Dependencias: react, react-native, expo-router, @expo/vector-icons.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: la página PROPIA de cada noticia (dueño, 2026-11-09: atraer visitas desde Google con las noticias), en
 * /noticias/<id>, con el diseño de la tienda (CabeceraMarca, colores, ImagenInteligente, CargaMarca). Enseña la categoría y la
 * fecha, el título como encabezado principal (h1), la foto principal (solo si el servidor comprobó las fotos:
 * imagenes_verificadas), el resumen, «Contexto» (columna contexto, si existe y tiene texto), «Puntos clave», «Datos»,
 * «Por qué importa», «A quién afecta» y «Fuente: <medio>» con enlace al original (fuera de la tienda, nofollow). Al
 * final, «Compra con confianza» y el pie de página. Abajo, fija y siempre a la vista (dueño, 2026-11-27), una barra
 * blanca de esquinas redondeadas con «Volver», «Me gusta» (con el total; sin cuenta lleva a entrar y vuelve aquí; tabla
 * noticias_likes, la misma del Foro), «Comentar · N» (desde el 2026-11-27 abre aquí mismo la hoja de comentarios al
 * estilo Instagram, HojaComentariosNoticia de components/foro/NoticiasForo.tsx, con los mismos comentarios que el Foro) y
 * «Compartir» (compartirFuera). La barra es una burbuja azul claro. Analítica propia: «Noticias: barra · me
 * gusta/comentar/compartir/volver» y «Noticias: comentario enviado desde la noticia» (Administración → Analítica,
 * #analitica-noticia-barra).
 *
 * Columnas opcionales: «contexto» la añade otra migración; si aún no existe (42703/PGRST204) la consulta se repite sin
 * ella, y lo mismo con las fotos. Sin noticia (no existe, no está publicada o el enlace está mal): mensaje y «Ver noticias».
 *
 * Para Google: título «<titulo> | Noticias | VideojuegosZaragoza», meta description (el resumen recortado), dirección
 * oficial (canonical), og:* y datos estructurados NewsArticle, escritos en el <head> con el mismo método que
 * components/EtiquetasCabeceraWeb.tsx (DOM directo; EtiquetasCabeceraWeb deja estas rutas a la página) y quitados al salir.
 *
 * Analítica propia (Administración → Analítica, #analitica-noticias-organicas): «Noticias: página vista · <categoría>»
 * y, si la visita entró por la noticia desde un buscador, «Noticias: llegada desde buscador · Google» (solo el nombre
 * del buscador; lib/analiticaPropia.ts → medirNoticiaDesdeBuscador).
 *
 * Conectado con:
 * - lib/supabase.ts → tabla noticias_gaming (lectura pública, publicada = true); la llena api/noticias-gaming.ts.
 * - components/EtiquetasCabeceraWeb.tsx → ponerEtiquetaMeta/ponerEnlaceCabecera y RUTAS_CON_CABECERA_PROPIA.
 * - app/servicio/[id].tsx → faltaColumna (reintentar sin la columna que falta).
 * - app/noticias/index.tsx → el índice de noticias (usa leerFotosNoticia, CATEGORIAS_NOTICIAS y fechaNoticia de aquí).
 * - app/(tabs)/chat-global.tsx → el Foro («Comentar en el Foro»; su tarjeta enlaza aquí y comparte esta dirección).
 * - api/sitemap.ts → cada noticia de los últimos 90 días; vercel.json → rewrite /noticias/:id.
 * - lib/analiticaPropia.ts → medirEvento y medirNoticiaDesdeBuscador; app/admin/analytics.tsx → su tarjeta.
 */
import React, { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { compartirFuera, HojaComentariosNoticia } from "../../components/foro/NoticiasForo";
import { Animated, Easing, Linking, Platform, Pressable, ScrollView, StatusBar, Text, View, useWindowDimensions } from "react-native";
import { Link, router, useLocalSearchParams, type Href } from "expo-router";
import { useProgresoDesplazamiento } from "../../components/DesplazamientoSuave";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { medirNoticiaDesdeBuscador, medirEvento } from "../../lib/analiticaPropia";
import ImagenInteligente from "../../components/ImagenInteligente";
import CargaMarca from "../../components/marca/CargaMarca";
import MarcaAnimada from "../../components/marca/MarcaAnimada";
import CabeceraMarca from "../../components/CabeceraMarca";
import PieDePagina, { FilaConfianza, VentanaInformacion, type DatoConfianza } from "../../components/PieDePagina";
import { ponerEnlaceCabecera, ponerEtiquetaMeta } from "../../components/EtiquetasCabeceraWeb";
import { useRecarga } from "../../components/TirarParaActualizar";
import { faltaColumna } from "../servicio/[id]";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
};

const DOMINIO = "https://videojuegoszaragoza.com";
const MARCA = "VideojuegosZaragoza";

// Las categorías que escribe api/noticias-gaming.ts (sin «Gaming», la de reserva), para los filtros del índice.
export const CATEGORIAS_NOTICIAS = ["Videojuegos", "Consolas", "PC gaming", "Móviles y tablets", "Accesorios", "Ofertas"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNAS_BASE = "id,url,fuente,titulo,imagen_url,categoria,resumen,puntos_clave,datos,por_que_importa,afecta_a,publicada_en,created_at";

export type NoticiaPagina = {
  id: string;
  url: string | null;
  fuente: string;
  titulo: string;
  categoria: string;
  resumen: string;
  contexto: string | null;
  puntosClave: string[];
  datos: string[];
  porQueImporta: string | null;
  afectaA: string | null;
  publicadaEn: string | null;
  fotos: string[];
};

function textos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string" && !!v.trim()) : [];
}

function textoONull(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

// Solo las fotos que el servidor comprobó (imagenes_verificadas), https y sin repetir (lo mismo que el Foro).
export function leerFotosNoticia(r: { imagenes_verificadas?: unknown; imagen_url?: unknown; imagenes?: unknown }): string[] {
  if (r.imagenes_verificadas !== true) return [];
  const salida: string[] = [];
  for (const u of [r.imagen_url, ...(Array.isArray(r.imagenes) ? r.imagenes : [])]) {
    if (typeof u === "string" && /^https:\/\//i.test(u) && !salida.includes(u)) salida.push(u);
  }
  return salida.slice(0, 6);
}

export function fechaNoticia(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

// La descripción para Google: el resumen en una línea, recortado a ~155 letras sin partir palabras.
export function recortar(texto: string, max = 155): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > max * 0.6 ? corte.slice(0, espacio) : corte).replace(/[\s,.;:–-]+$/, "")}…`;
}

// Una noticia publicada, o null si no existe / no está publicada / el enlace no es válido. Lanza solo si falla la red.
export async function leerNoticia(id: string): Promise<NoticiaPagina | null> {
  if (!UUID_RE.test(id)) return null;
  const consulta = (columnas: string) =>
    supabase.from("noticias_gaming").select(columnas).eq("id", id).eq("publicada", true).maybeSingle();
  // Con contexto y fotos; sin contexto (migración pendiente); sin fotos (sin esas columnas).
  let { data, error } = await consulta(`${COLUMNAS_BASE},imagenes,imagenes_verificadas,contexto`);
  if (error && faltaColumna(error)) ({ data, error } = await consulta(`${COLUMNAS_BASE},imagenes,imagenes_verificadas`));
  if (error && faltaColumna(error)) ({ data, error } = await consulta(COLUMNAS_BASE));
  if (error) {
    if ((error as { code?: string }).code === "22P02") return null;
    throw error;
  }
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  const url = textoONull(r.url);
  return {
    id: String(r.id),
    url: url && /^https?:\/\//i.test(url) ? url : null,
    fuente: String(r.fuente ?? "").trim(),
    titulo: String(r.titulo ?? "").trim(),
    categoria: String(r.categoria ?? "").trim() || "Gaming",
    resumen: String(r.resumen ?? "").trim(),
    contexto: textoONull(r.contexto),
    puntosClave: textos(r.puntos_clave),
    datos: textos(r.datos),
    porQueImporta: textoONull(r.por_que_importa),
    afectaA: textoONull(r.afecta_a),
    publicadaEn: (r.publicada_en as string | null) ?? (r.created_at as string | null) ?? null,
    fotos: leerFotosNoticia(r),
  };
}

// Título, descripción, og:*, dirección oficial y NewsArticle en el <head> (solo web). Devuelve cómo dejarlo al salir.
function ponerCabecera(n: NoticiaPagina): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const direccion = `${DOMINIO}/noticias/${n.id}`;
  const titulo = `${n.titulo} | Noticias | ${MARCA}`;
  const descripcion = recortar(n.resumen || n.titulo);
  const imagen = n.fotos[0] ?? `${DOMINIO}/icono-512.png`;
  const meta = (attr: "name" | "property", clave: string) =>
    // Sin las del HTML ya generado (data-rh), que se quitan solas al arrancar la tienda.
    document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${clave}"]:not([data-rh])`)?.getAttribute("content") ?? null;
  const antes = {
    titulo: document.title,
    descripcion: meta("name", "description"),
    ogTitle: meta("property", "og:title"),
    ogDescription: meta("property", "og:description"),
    ogImage: meta("property", "og:image"),
    ogType: meta("property", "og:type"),
  };

  document.title = titulo;
  ponerEtiquetaMeta("name", "description", descripcion);
  ponerEtiquetaMeta("property", "og:title", titulo);
  ponerEtiquetaMeta("property", "og:description", descripcion);
  ponerEtiquetaMeta("property", "og:image", imagen);
  ponerEtiquetaMeta("property", "og:type", "article");
  ponerEtiquetaMeta("property", "og:url", direccion);
  ponerEnlaceCabecera("canonical", direccion);

  const datos: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: n.titulo.slice(0, 110),
    description: descripcion,
    url: direccion,
    mainEntityOfPage: { "@type": "WebPage", "@id": direccion },
    inLanguage: "es-ES",
    articleSection: n.categoria,
    image: n.fotos.length ? n.fotos : [imagen],
    ...(n.publicadaEn ? { datePublished: n.publicadaEn, dateModified: n.publicadaEn } : {}),
    author: { "@type": "Organization", name: MARCA, url: DOMINIO },
    publisher: { "@type": "Organization", name: MARCA, url: DOMINIO, logo: { "@type": "ImageObject", url: `${DOMINIO}/icono-512.png` } },
    ...(n.url
      ? {
          isBasedOn: n.url,
          citation: { "@type": "CreativeWork", url: n.url, ...(n.fuente ? { publisher: { "@type": "Organization", name: n.fuente } } : {}) },
        }
      : {}),
  };
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = "datos-noticia";
  // Con textContent (nunca como HTML) y «<» escapado: ningún texto de la noticia puede cerrar la etiqueta.
  script.textContent = JSON.stringify(datos).replace(/</g, "\\u003c");
  document.getElementById("datos-noticia")?.remove();
  document.head.appendChild(script);

  return () => {
    script.remove();
    // Al salir, lo que había (la página siguiente o EtiquetasCabeceraWeb ponen después lo suyo).
    if (document.title === titulo) document.title = antes.titulo;
    if (antes.descripcion !== null) ponerEtiquetaMeta("name", "description", antes.descripcion);
    if (antes.ogTitle !== null) ponerEtiquetaMeta("property", "og:title", antes.ogTitle);
    if (antes.ogDescription !== null) ponerEtiquetaMeta("property", "og:description", antes.ogDescription);
    if (antes.ogImage !== null) ponerEtiquetaMeta("property", "og:image", antes.ogImage);
    ponerEtiquetaMeta("property", "og:type", antes.ogType ?? "website");
  };
}

function volver() {
  try {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // sin historial
  }
  router.replace("/noticias" as Href);
}

// Todo el texto de la noticia centrado, como el resto de la tienda (dueño, 2026-11-26).
function Seccion({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <View nativeID={id} style={{ width: "100%", gap: 8, alignItems: "center" }}>
      <Text accessibilityRole="header" {...({ "aria-level": 2 } as object)} style={{ color: COLORS.text, fontWeight: "900", fontSize: 17, textAlign: "center" }}>
        {titulo}
      </Text>
      {children}
    </View>
  );
}

// Centradas: cada punto con su viñeta azul delante, en la misma línea del texto.
function Vinetas({ items }: { items: string[] }) {
  return (
    <View style={{ gap: 8, width: "100%" }}>
      {items.map((t, i) => (
        <Text key={i} style={{ color: COLORS.text, fontSize: 15, lineHeight: 22, textAlign: "center" }}>
          <Text style={{ color: COLORS.accent, fontWeight: "900" }}>• </Text>
          {t}
        </Text>
      ))}
    </View>
  );
}

// Enlace interno de verdad (<a href> en la web, para que Google lo siga) con forma de píldora. Dentro de <Link asChild>
// el estilo tiene que ser un objeto (con una función, Link lo pierde).
function EnlacePildora({ href, texto, icono, id }: { href: string; texto: string; icono: keyof typeof Ionicons.glyphMap; id: string }) {
  return (
    <Link href={href as Href} asChild>
      <Pressable
        nativeID={id}
        accessibilityRole="link"
        style={{
          minHeight: 44,
          paddingHorizontal: 16,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: COLORS.accentBorder,
          backgroundColor: COLORS.accent2,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
        }}
      >
        <Ionicons name={icono} size={16} color={COLORS.accent} />
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 14 }}>{texto}</Text>
      </Pressable>
    </Link>
  );
}

// Un botón de la barra fija de abajo: icono y nombre debajo, centrados, 52 px de alto.
function BotonBarra({
  id,
  icono,
  texto,
  etiqueta,
  onPress,
  color,
  activo,
  escala,
}: {
  id: string;
  icono: React.ComponentProps<typeof Ionicons>["name"];
  texto: string;
  etiqueta: string;
  onPress: () => void;
  color?: string;
  activo?: boolean;
  /** Tamaño animado del icono (el salto del corazón al dar «Me gusta»). */
  escala?: Animated.Value;
}) {
  return (
    <Pressable
      nativeID={id}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={activo === undefined ? undefined : { selected: activo }}
      style={({ pressed }) => ({ flex: 1, minHeight: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: pressed ? COLORS.accentBorder : "transparent" })}
    >
      <Animated.View nativeID={`${id}-icono`} style={escala ? { transform: [{ scale: escala }] } : undefined}>
        <Ionicons name={icono} size={21} color={color ?? COLORS.text} />
      </Animated.View>
      <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "800", fontSize: 13, textAlign: "center" }}>
        {texto}
      </Text>
    </Pressable>
  );
}

export default function NoticiaScreen() {
  const { width } = useWindowDimensions();
  const ancho = width > 0 ? width : 1024;
  const isMobile = ancho < 700;
  const pagePadding = isMobile ? 16 : 24;
  const progresoScroll = useProgresoDesplazamiento();
  const [infoConfianza, setInfoConfianza] = useState<DatoConfianza | null>(null);

  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [n, setN] = useState<NoticiaPagina | null>(null);

  async function cargar(silencioso = false) {
    if (!silencioso) setCargando(true);
    setFallo(false);
    try {
      const fila = await leerNoticia(id);
      setN(fila);
      if (fila && !silencioso) {
        medirEvento("noticia_pagina", `Noticias: página vista · ${fila.categoria}`, { path: `/noticias/${fila.id}`, metadata: { categoria: fila.categoria } });
        medirNoticiaDesdeBuscador(`/noticias/${fila.id}`);
      }
    } catch (e) {
      console.error("Error cargando la noticia:", e);
      setFallo(true);
      setN(null);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const recarga = useRecarga();
  useEffect(() => {
    if (recarga > 0) cargar(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recarga]);

  useEffect(() => (n ? ponerCabecera(n) : undefined), [n]);

  // «Comentar» abre la hoja de comentarios aquí mismo, como en Instagram (dueño, 2026-11-27), en vez de llevar al Foro.
  const [comentariosAbiertos, setComentariosAbiertos] = useState(false);
  const [totalComentarios, setTotalComentarios] = useState<number | null>(null);
  function comentar() {
    if (!n) return;
    medirEvento("noticia_barra", "Noticias: barra · comentar", { path: `/noticias/${n.id}` });
    setComentariosAbiertos(true);
  }
  useEffect(() => {
    if (!n) return;
    let vivo = true;
    void supabase
      .from("noticias_comentarios")
      .select("id")
      .eq("noticia_id", n.id)
      .eq("oculto", false)
      .limit(500)
      .then(({ data, error }) => {
        if (vivo && !error && Array.isArray(data)) setTotalComentarios(data.length);
      });
    return () => {
      vivo = false;
    };
  }, [n]);
  async function pedirSesionParaComentar() {
    if (!n) return;
    setComentariosAbiertos(false);
    await AsyncStorage.setItem("videojuegoszaragoza:volver_tras_acceso", JSON.stringify({ ruta: `/noticias/${n.id}`, hasta: Date.now() + 30 * 60 * 1000 })).catch(() => {});
    router.push(`/perfil?acceso=entrar&aviso=${encodeURIComponent("Inicia sesión o crea tu cuenta gratis para comentar. Al terminar volverás a esta noticia.")}` as Href);
  }

  // Barra fija de abajo (dueño, 2026-11-27): volver, me gusta, comentar y compartir, siempre a mano.
  const insets = useSafeAreaInsets();
  const [meGusta, setMeGusta] = useState(false);
  const [totalMeGusta, setTotalMeGusta] = useState<number | null>(null);
  const [copiado, setCopiado] = useState(false);
  const guardandoMeGusta = useRef(false);
  const medirBarra = (accion: string) => n && medirEvento("noticia_barra", `Noticias: barra · ${accion}`, { path: `/noticias/${n.id}` });

  // El total (noticias_gaming.me_gusta) y si este cliente ya le dio (noticias_likes, igual que en el Foro).
  useEffect(() => {
    if (!n) return;
    let vivo = true;
    (async () => {
      const { data: fila } = await supabase.from("noticias_gaming").select("me_gusta").eq("id", n.id).maybeSingle();
      const total = (fila as { me_gusta?: unknown } | null)?.me_gusta;
      if (vivo && total != null && Number.isFinite(Number(total))) setTotalMeGusta(Math.max(0, Number(total)));
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user?.id;
      if (!uid) return;
      const { data } = await supabase.from("noticias_likes").select("noticia_id").eq("user_id", uid).eq("noticia_id", n.id);
      if (vivo) setMeGusta(!!data?.length);
    })().catch(() => {});
    return () => {
      vivo = false;
    };
  }, [n]);

  // Salto del corazón al dar «Me gusta», como en Instagram (dueño, 2026-11-27): crece, se encoge un poco y vuelve.
  const escalaCorazon = useRef(new Animated.Value(1)).current;
  function saltarCorazon() {
    escalaCorazon.stopAnimation();
    escalaCorazon.setValue(1);
    Animated.sequence([
      Animated.timing(escalaCorazon, { toValue: 1.45, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(escalaCorazon, { toValue: 0.88, duration: 110, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
      Animated.spring(escalaCorazon, { toValue: 1, friction: 4, tension: 160, useNativeDriver: Platform.OS !== "web" }),
    ]).start();
  }

  async function alternarMeGusta() {
    if (!n || guardandoMeGusta.current) return;
    medirBarra("me gusta");
    const { data: s } = await supabase.auth.getSession();
    const uid = s.session?.user?.id;
    if (!uid) {
      // Sin cuenta: a entrar o crear una (gratis) y, al terminar, de vuelta a esta noticia.
      await AsyncStorage.setItem("videojuegoszaragoza:volver_tras_acceso", JSON.stringify({ ruta: `/noticias/${n.id}`, hasta: Date.now() + 30 * 60 * 1000 })).catch(() => {});
      router.push(`/perfil?acceso=entrar&aviso=${encodeURIComponent("Inicia sesión o crea tu cuenta gratis para dar «Me gusta». Al terminar volverás a esta noticia.")}` as Href);
      return;
    }
    guardandoMeGusta.current = true;
    const siguiente = !meGusta;
    setMeGusta(siguiente);
    if (siguiente) saltarCorazon();
    setTotalMeGusta((t) => (t == null ? t : Math.max(0, t + (siguiente ? 1 : -1))));
    const { error } = siguiente
      ? await supabase.from("noticias_likes").insert({ noticia_id: n.id })
      : await supabase.from("noticias_likes").delete().eq("noticia_id", n.id).eq("user_id", uid);
    guardandoMeGusta.current = false;
    // 23505: ya le había dado (p. ej. desde otro dispositivo), así que ya estaba contado.
    if (error && !(siguiente && error.code === "23505")) {
      setMeGusta(!siguiente);
      setTotalMeGusta((t) => (t == null ? t : Math.max(0, t + (siguiente ? -1 : 1))));
    } else if (error) {
      setTotalMeGusta((t) => (t == null ? t : Math.max(0, t - 1)));
    }
  }

  async function compartir() {
    if (!n) return;
    medirBarra("compartir");
    if ((await compartirFuera(n)) === "copiado") {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    }
  }

  // El original se abre fuera de la tienda: en la web es un enlace normal (nueva pestaña, nofollow).
  const enlaceFuente =
    n?.url && Platform.OS === "web"
      ? ({ href: n.url, hrefAttrs: { target: "_blank", rel: "nofollow noopener noreferrer" } } as object)
      : {};

  return (
    <View nativeID="noticia-pagina" style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />
      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.card,
          paddingHorizontal: pagePadding,
          paddingTop: isMobile ? 12 : 14,
          paddingBottom: isMobile ? 12 : 14,
          alignItems: "center",
        }}
      >
        <View style={{ width: "100%", maxWidth: 1240 }}>
          <CabeceraMarca onBack={volver} />
        </View>
      </View>

      {cargando ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <CargaMarca texto="Cargando noticia…" />
        </View>
      ) : !n ? (
        <View nativeID="noticia-no-encontrada" style={{ padding: pagePadding, paddingTop: 28, gap: 12, alignItems: "center" }}>
          <MarcaAnimada cual="logo-mini" ancho={96} />
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 17, textAlign: "center" }}>
            {fallo ? "No hemos podido cargar la noticia" : "Esta noticia no existe o ya no está publicada"}
          </Text>
          <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center", maxWidth: 420 }}>
            {fallo ? "Inténtalo de nuevo en unos instantes." : "Puede que se haya retirado. Tienes el resto de noticias en el índice."}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            {fallo ? (
              <Pressable
                onPress={() => cargar()}
                accessibilityRole="button"
                style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1, minHeight: 44, justifyContent: "center", borderRadius: 999, paddingHorizontal: 18, backgroundColor: COLORS.accent2, borderWidth: 1, borderColor: COLORS.accentBorder })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Reintentar</Text>
              </Pressable>
            ) : null}
            <EnlacePildora id="noticia-ver-noticias" href="/noticias" texto="Ver noticias" icono="newspaper-outline" />
          </View>
        </View>
      ) : (
        <ScrollView
          {...progresoScroll.propsScroll}
          showsVerticalScrollIndicator={false}
          // Hueco abajo para que la barra fija no tape el final del pie.
          contentContainerStyle={{ paddingHorizontal: pagePadding, paddingTop: 18, paddingBottom: 110 + insets.bottom, alignItems: "center" }}
        >
          <View style={{ width: "100%", maxWidth: 760, gap: 16 }}>
            <View style={{ alignItems: "center", gap: 8 }}>
              <Text
                nativeID="noticia-categoria"
                style={{ color: COLORS.accent, fontSize: 11.5, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase", textAlign: "center" }}
              >
                {[n.categoria, fechaNoticia(n.publicadaEn)].filter(Boolean).join(" · ")}
              </Text>
              <Text
                nativeID="noticia-titulo"
                accessibilityRole="header"
                {...({ "aria-level": 1 } as object)}
                style={{ color: COLORS.text, fontSize: isMobile ? 23 : 28, fontWeight: "900", lineHeight: isMobile ? 29 : 34, textAlign: "center" }}
              >
                {n.titulo}
              </Text>
            </View>

            {n.fotos[0] ? (
              <View style={{ borderRadius: 22, overflow: "hidden", backgroundColor: COLORS.card }}>
                <ImagenInteligente
                  uri={n.fotos[0]}
                  alt={n.titulo}
                  ancho={isMobile ? 420 : 760}
                  priority="high"
                  contentFit="contain"
                  style={{ width: "100%", height: isMobile ? 230 : 400, backgroundColor: COLORS.card }}
                />
              </View>
            ) : null}

            {n.resumen ? (
              <Text nativeID="noticia-resumen" style={{ color: COLORS.text, fontSize: 16.5, lineHeight: 25, fontWeight: "600", textAlign: "center" }}>
                {n.resumen}
              </Text>
            ) : null}

            {n.contexto ? (
              <Seccion id="noticia-contexto" titulo="Contexto">
                <Text style={{ color: COLORS.text, fontSize: 15, lineHeight: 23, textAlign: "center" }}>{n.contexto}</Text>
              </Seccion>
            ) : null}
            {n.puntosClave.length ? (
              <Seccion id="noticia-puntos" titulo="Puntos clave">
                <Vinetas items={n.puntosClave} />
              </Seccion>
            ) : null}
            {n.datos.length ? (
              <Seccion id="noticia-datos" titulo="Datos">
                <Vinetas items={n.datos} />
              </Seccion>
            ) : null}
            {n.porQueImporta ? (
              <Seccion id="noticia-importa" titulo="Por qué importa">
                <Text style={{ color: COLORS.text, fontSize: 15, lineHeight: 23, textAlign: "center" }}>{n.porQueImporta}</Text>
              </Seccion>
            ) : null}
            {n.afectaA ? (
              <Seccion id="noticia-afecta" titulo="A quién afecta">
                <Text style={{ color: COLORS.text, fontSize: 15, lineHeight: 23, textAlign: "center" }}>{n.afectaA}</Text>
              </Seccion>
            ) : null}

            {n.fuente || n.url ? (
              <View nativeID="noticia-fuente" style={{ borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12, alignItems: "center", gap: 4 }}>
                <Text style={{ color: COLORS.muted, fontSize: 13, textAlign: "center" }}>
                  Fuente:{" "}
                  {n.url ? (
                    <Text
                      {...enlaceFuente}
                      accessibilityRole="link"
                      onPress={Platform.OS === "web" ? undefined : () => Linking.openURL(n.url as string).catch(() => {})}
                      style={{ color: COLORS.accent, fontWeight: "800", textDecorationLine: "underline" }}
                    >
                      {n.fuente || "artículo original"}
                    </Text>
                  ) : (
                    <Text style={{ color: COLORS.text, fontWeight: "800" }}>{n.fuente}</Text>
                  )}
                </Text>
                <Text style={{ color: COLORS.muted, fontSize: 11.5, textAlign: "center", lineHeight: 16 }}>
                  Resumen redactado por Videojuegoszaragoza.com a partir del artículo original.
                </Text>
              </View>
            ) : null}

            {/* «Comentar en el Foro» va ahora en la barra fija de abajo (dueño, 2026-11-27). */}

            {/* En vez de «Más noticias», «Catálogo» y «Servicios» (dueño, 2026-11-26): «Compra con confianza» y el pie de
                página completo, como en Inicio (los tres enlaces siguen en el pie, como enlaces de verdad). */}
            <View nativeID="noticia-confianza" style={{ alignItems: "center", gap: 10, marginTop: 12 }}>
              <Text accessibilityRole="header" {...({ "aria-level": 2 } as object)} style={{ color: COLORS.text, fontWeight: "900", fontSize: 19, textAlign: "center" }}>
                Compra con confianza
              </Text>
              <FilaConfianza isMobile={isMobile} onPressItem={setInfoConfianza} />
            </View>
          </View>
          <View style={{ width: "100%", marginTop: 28 }}>
            <PieDePagina sidePadding={pagePadding} contentMaxWidth={760} />
          </View>
        </ScrollView>
      )}
      {/* Barra fija de abajo (dueño, 2026-11-27): un bloque blanco de esquinas redondeadas, siempre a la vista, con
          volver, me gusta (y el total), comentar en el Foro y compartir; cada botón de 44 px o más y con su nombre. */}
      {n ? (
        <View
          pointerEvents="box-none"
          // Mismos márgenes que el contenido de la página (dueño, 2026-11-27: «que respeten los márgenes inferiores y de
          // los lados»): 16 px a los lados en el móvil (24 en el ordenador) y 16 abajo, más la zona segura del iPhone.
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: pagePadding, paddingBottom: Math.max(16, insets.bottom + 12), alignItems: "center" }}
        >
          {copiado ? (
            <View nativeID="noticia-copiado" style={{ marginBottom: 8, borderRadius: 999, backgroundColor: COLORS.text, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13, textAlign: "center" }}>Enlace copiado</Text>
            </View>
          ) : null}
          <View
            nativeID="noticia-barra"
            style={{
              width: "100%",
              maxWidth: 560,
              flexDirection: "row",
              // Burbuja en azul claro para que destaque (dueño, 2026-11-27).
              backgroundColor: COLORS.accent2,
              borderRadius: 22,
              borderWidth: 1.5,
              borderColor: COLORS.accentBorder,
              paddingVertical: 4,
              paddingHorizontal: 4,
              boxShadow: "0px 6px 24px rgba(11,33,56,0.14)",
            }}
          >
            <BotonBarra id="noticia-volver" icono="arrow-back" texto="Volver" etiqueta="Volver" onPress={() => {
              medirBarra("volver");
              volver();
            }} />
            <BotonBarra
              id="noticia-me-gusta"
              icono={meGusta ? "heart" : "heart-outline"}
              color={meGusta ? "#E5484D" : undefined}
              texto={totalMeGusta ? `Me gusta · ${totalMeGusta}` : "Me gusta"}
              etiqueta={meGusta ? "Quitar me gusta" : "Me gusta"}
              activo={meGusta}
              escala={escalaCorazon}
              onPress={alternarMeGusta}
            />
            <BotonBarra
              id="noticia-comentar"
              icono="chatbubble-outline"
              texto={totalComentarios ? `Comentar · ${totalComentarios}` : "Comentar"}
              etiqueta="Ver y escribir comentarios"
              onPress={comentar}
            />
            <BotonBarra id="noticia-compartir" icono="share-outline" texto="Compartir" etiqueta="Compartir la noticia" onPress={compartir} />
          </View>
        </View>
      ) : null}
      {/* Barra fina de progreso a la izquierda (páginas largas, 2026-11-25). Solo sale si la noticia es larga. */}
      {progresoScroll.barra}
      <VentanaInformacion item={infoConfianza} onClose={() => setInfoConfianza(null)} onCambiar={setInfoConfianza} />
      {n ? (
        <HojaComentariosNoticia
          noticiaId={n.id}
          abierta={comentariosAbiertos}
          onCerrar={() => setComentariosAbiertos(false)}
          onComentado={(cambio) => setTotalComentarios((t) => Math.max(0, (t ?? 0) + cambio))}
          onPedirSesion={() => void pedirSesionParaComentar()}
        />
      ) : null}
    </View>
  );
}
