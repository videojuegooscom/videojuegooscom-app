// app/servicio/[id].tsx
/**
 * Qué hace: ficha de un SERVICIO individual (reparación, limpieza,
 * mantenimiento...) con el MISMO formato que la ficha de producto
 * (app/producto/[id].tsx, petición del dueño 2026-11-03): título y subtítulo,
 * galería (posición «1 / 3», flechas en el ordenador, deslizar con el dedo,
 * miniaturas y foto en grande con zoom al tocarla), visitas, precio, el botón
 * principal, el de preguntar, la ficha con pestañas «Características» y
 * «Descripción» (FichaProducto, la misma de producto) y «Volver atrás» al
 * final. Las diferencias que pidió Jefe se mantienen: no hay «Añadir a la
 * cesta» ni Cantidad, y «Comprar ya» es «Contratar servicio ahora», que abre
 * components/ContratarServicioModal.tsx. Las dudas, como en producto:
 * «Preguntar por este servicio» abre Blue IA con el servicio como contexto
 * (?servicio=<id>) y, desde ahí, «Hablar con el equipo» abre el chat de la
 * tienda (sin WhatsApp; petición del dueño, 2026-11-03).
 *
 * «Me gusta» (dueño, 2026-11-03), como en producto: uno por persona y servicio
 * (api/interaccion.ts, acción apoyo_servicio; migración
 * 20261103200000_servicios_me_gusta.sql). Este dispositivo recuerda los suyos
 * (LIKED_SERVICES_KEY) y la pestaña «Me gusta» de Perfil los enseña. Sin la
 * migración (services.like_count no existe) el corazón no sale y nada se rompe.
 *
 * Reseñas (dueño, 2026-11-03): «Mis seguimientos» pide valorar el servicio al
 * entregarlo y aquí salen la media junto al precio y las opiniones debajo de
 * las pestañas (store_reviews con service_id; sin la migración
 * 20261103210000_resenas_servicios.sql, no sale nada).
 *
 * "X Visitas": mismo mecanismo REAL que en producto/[id].tsx (ver
 * sql/services.sql, columna view_count y función increment_service_view).
 *
 * Analítica (Administración → Analítica, #analitica-ficha-servicio): fotos
 * ampliadas, «Contratar servicio ahora» y «Preguntar por este servicio».
 *
 * Conectado con:
 * - lib/supabase.ts → tablas services, service_media.
 * - sql/services.sql, sql/service_media.sql → esquema y RLS.
 * - components/ContratarServicioModal.tsx → formulario de "Contratar
 *   servicio ahora" (inserta en service_requests, ver
 *   sql/service_requests.sql).
 * - components/ImageLightbox.tsx → foto en grande con zoom.
 * - app/servicios.tsx → catálogo del que se navega hasta aquí, y a donde
 *   vuelve «Volver atrás» si no hay historial.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { contarVistaServicio, fijarMeGustaServicio, guardarMeGustaLocal, LIKED_SERVICES_KEY, meGustaLocales } from "../../lib/interaccion";
import { trackEvent } from "../../lib/analytics";
import { leerModalidades, type ModalidadServicio } from "../../components/ContratarServicioModal";
import { SelectorIOS } from "../../lib/admin/products.components";
import ImageLightbox, { type LightboxImage } from "../../components/ImageLightbox";
import SmartImage from "../../components/SmartImage";
import MarcaAnimada from "../../components/marca/MarcaAnimada";
import CargaMarca from "../../components/marca/CargaMarca";
import CabeceraMarca from "../../components/CabeceraMarca";
import { useRecarga } from "../../components/TirarParaActualizar";
import { FichaProducto, type Caracteristica } from "../producto/[id]";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  bg3: "#F6FAFD",
  card: "#F6FAFD",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  accentDark: "#1EA7E8",
};

const SIN_DESCRIPCION_SERVICIO =
  "Todavía no hay una descripción disponible para este servicio. Aun así, puedes preguntarnos por su alcance, tiempo estimado o garantía con «Preguntar por este servicio».";

// Precio siempre con dos decimales, coma decimal y miles con punto (155,00€ · 1.299,00€).
function fmtEUR(n: number) {
  const v = Number(n);
  const cents = Math.round((Number.isFinite(v) ? v : 0) * 100);
  const [ent, dec] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${cents < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

function smartBack() {
  try {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // ignore
  }
  router.replace("/servicios" as any);
}

type ServiceMedia = {
  id: string;
  publicUrl: string;
  isCover: boolean;
};

type Service = {
  id: string;
  title: string;
  description: string;
  priceEUR: number;
  media: ServiceMedia[];
  // null: la base de datos aún no tiene los «me gusta» de servicios (migración 20261103200000 sin aplicar).
  likeCount: number | null;
  // Opciones del servicio (Básica, Completa…), de Administración → Servicios (migración 20261108230000). [] = sin opciones.
  modalidades: ModalidadServicio[];
};

type ResenaServicio = { id: string; created_at: string; display_name: string; rating: number; comment: string };

// Reseñas de los clientes que contrataron ESTE servicio (las une a su solicitud la base de datos, migración
// 20261103210000_resenas_servicios.sql). null: aún no se pueden leer (sin la migración, el bloque no sale).
async function fetchResenas(serviceId: string): Promise<ResenaServicio[] | null> {
  const { data, error } = await supabase
    .from("store_reviews")
    .select("id,created_at,display_name,rating,comment")
    .eq("service_id", serviceId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return null;
  return (data ?? []) as ResenaServicio[];
}

function estrellas(n: number) {
  const v = Math.max(0, Math.min(5, Math.round(n)));
  return "★".repeat(v) + "☆".repeat(5 - v);
}

// ¿Falta una columna? (la migración aún no se ha aplicado): entonces se repite la consulta sin ella.
function faltaColumna(error: unknown) {
  const e = error as { code?: string; message?: string } | null;
  return !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist|Could not find the .* column/i.test(e.message ?? ""));
}

// También la usa la página «Contratar servicio» (app/contratar/[id].tsx).
export async function fetchService(serviceId: string): Promise<Service | null> {
  const consulta = (columnas: string) =>
    supabase.from("services").select(columnas).eq("id", serviceId).eq("status", "PUBLISHED").eq("is_active", true).maybeSingle();
  let { data: row, error } = await consulta("id,title,description,price_eur,like_count,modalidades");
  if (error && faltaColumna(error)) ({ data: row, error } = await consulta("id,title,description,price_eur,like_count"));
  if (error && faltaColumna(error)) ({ data: row, error } = await consulta("id,title,description,price_eur"));

  if (error) throw error;
  if (!row) return null;
  const fila = row as unknown as {
    id: string;
    title: string;
    description: string | null;
    price_eur: number | null;
    like_count?: number | null;
    modalidades?: unknown;
  };

  const { data: media } = await supabase
    .from("service_media")
    .select("id,public_url,is_cover,sort_order")
    .eq("service_id", serviceId)
    .order("is_cover", { ascending: false })
    .order("sort_order", { ascending: true });

  const normalizedMedia: ServiceMedia[] = ((media ?? []) as any[])
    .filter((m) => m.public_url)
    .map((m) => ({ id: m.id, publicUrl: m.public_url, isCover: Boolean(m.is_cover) }));

  return {
    id: fila.id,
    title: fila.title,
    description: fila.description ?? "",
    priceEUR: Number(fila.price_eur ?? 0),
    media: normalizedMedia,
    likeCount: "like_count" in fila ? Math.max(0, Number(fila.like_count ?? 0)) : null,
    modalidades: leerModalidades(fila.modalidades),
  };
}

export default function ServicioScreen() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const isTablet = widthSafe >= 700 && widthSafe < 1080;
  const isWide = widthSafe >= 1080;
  const pagePadding = isMobile ? 12 : 16;

  const params = useLocalSearchParams<{ id?: string }>();
  const serviceId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [s, setS] = useState<Service | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  // «Me gusta», como en producto: uno por persona; este dispositivo recuerda los suyos (LIKED_SERVICES_KEY).
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState<number | null>(null);
  const [likeBusy, setLikeBusy] = useState(false);
  const [resenas, setResenas] = useState<ResenaServicio[] | null>(null);
  // La opción elegida (si el servicio tiene opciones): la primera de la lista al entrar.
  const [modalidad, setModalidad] = useState("");

  // silencioso («Desliza para actualizar»): sin volver a la pantalla de carga y sin contar otra visita.
  async function load(silencioso = false) {
    if (!serviceId) {
      setErr("No hemos podido encontrar este servicio.");
      setS(null);
      setLoading(false);
      return;
    }

    if (!silencioso) setLoading(true);
    setErr(null);
    try {
      const row = await fetchService(serviceId);
      if (!row) {
        setS(null);
        setErr("Este servicio no existe o ya no está disponible. Vuelve al listado de servicios para ver el resto.");
        return;
      }

      setS(row);
      setModalidad((v) => (row.modalidades.some((m) => m.nombre === v) ? v : row.modalidades[0]?.nombre ?? ""));
      const cover = row.media.find((m) => m.isCover) ?? row.media[0] ?? null;
      setSelectedImageUrl(cover?.publicUrl ?? null);
      setLikeCount(row.likeCount);
      meGustaLocales(LIKED_SERVICES_KEY).then((ids) => setLiked(ids.includes(row.id)));
      fetchResenas(row.id).then(setResenas);

      if (!silencioso) {
        contarVistaServicio(row.id).then((total) => {
          if (typeof total === "number") setViewCount(total);
        });
      }
    } catch (e) {
      console.error("Error cargando el servicio:", e);
      setErr("No hemos podido cargar este servicio en este momento. Inténtalo de nuevo en unos instantes.");
      setS(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  const recarga = useRecarga();
  useEffect(() => {
    if (recarga > 0) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recarga]);

  // El precio que se ve: el de la opción elegida o, sin opciones, el del servicio.
  const opcion = s?.modalidades.find((m) => m.nombre === modalidad) ?? null;
  const precioVisible = opcion ? opcion.precio_eur : s?.priceEUR ?? 0;

  function elegirModalidad(nombre: string) {
    setModalidad(nombre);
    // Administración → Analítica (#analitica-contratar-servicio): qué opción se mira más.
    trackEvent("servicio_opcion", `Servicio: opción elegida · ${nombre}`, { path: `/servicio/${s?.id ?? ""}` });
  }

  // La ficha con pestañas (la misma de producto): lo que ya contaba «Información del servicio».
  const caracteristicas: Caracteristica[] = useMemo(
    () =>
      s
        ? [
            { etiqueta: "Tipo", valor: "Reparación / Limpieza" },
            ...(s.modalidades.length
              ? s.modalidades.map((m) => ({ etiqueta: m.nombre, valor: fmtEUR(m.precio_eur) }))
              : [{ etiqueta: "Precio", valor: fmtEUR(s.priceEUR) }]),
            { etiqueta: "Contratación", valor: "Disponible ahora" },
          ]
        : [],
    [s]
  );

  const media = resenas?.length ? resenas.reduce((t, r) => t + r.rating, 0) / resenas.length : null;

  const imageGallery = s?.media ?? [];
  const lightboxImages: LightboxImage[] = useMemo(() => (s?.media ?? []).map((m) => ({ id: m.id, url: m.publicUrl })), [s]);

  function openLightbox() {
    if (!lightboxImages.length) return;
    const idx = selectedImageUrl ? lightboxImages.findIndex((img) => img.url === selectedImageUrl) : 0;
    setLightboxIndex(idx >= 0 ? idx : 0);
    setLightboxOpen(true);
    // Administración → Analítica (#analitica-ficha-servicio). El zoom lo cuenta el propio visor.
    trackEvent("foto_ampliada", "Servicio: foto ampliada", { path: `/servicio/${s?.id ?? ""}`, metadata: { fotos: lightboxImages.length } });
  }

  // Desliza la foto principal como un carrusel (el zoom vive en ImageLightbox); da la vuelta al llegar al final.
  function stepImage(delta: number) {
    if (imageGallery.length < 2) return;
    const currentIdx = imageGallery.findIndex((m) => m.publicUrl === selectedImageUrl);
    const base = currentIdx >= 0 ? currentIdx : 0;
    const next = ((base + delta) % imageGallery.length + imageGallery.length) % imageGallery.length;
    setSelectedImageUrl(imageGallery[next].publicUrl);
  }

  // Como en producto: posición actual («2 / 4»), miniaturas que solo se descargan cuando van a verse y la activa
  // siempre a la vista.
  const fotoActual = Math.max(0, imageGallery.findIndex((m) => m.publicUrl === selectedImageUrl));
  const ladoMiniatura = isMobile ? 74 : 88;
  const pasoMiniatura = ladoMiniatura + 10;
  const miniaturasRef = useRef<ScrollView>(null);
  const [anchoMiniaturas, setAnchoMiniaturas] = useState(0);
  const [miniaturasCargadas, setMiniaturasCargadas] = useState(0);
  const cargarMiniaturasHasta = useCallback(
    (px: number) => setMiniaturasCargadas((v) => Math.max(v, Math.ceil(px / pasoMiniatura) + 3)),
    [pasoMiniatura]
  );
  useEffect(() => {
    if (!anchoMiniaturas || imageGallery.length < 2) return;
    const izquierda = fotoActual * pasoMiniatura;
    const destino = Math.max(0, izquierda - (anchoMiniaturas - ladoMiniatura) / 2);
    cargarMiniaturasHasta(destino + anchoMiniaturas);
    miniaturasRef.current?.scrollTo({ x: destino, animated: true });
  }, [fotoActual, anchoMiniaturas, pasoMiniatura, ladoMiniatura, imageGallery.length, cargarMiniaturasHasta]);

  // Un toque corto abre la foto en grande; un arrastre horizontal claro cambia de foto. Se crea en cada render para
  // que siempre vea la foto y la galería actuales (como en producto).
  const mainImagePan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    // Solo reclama arrastres sobre todo horizontales: el vertical desplaza la ficha.
    onMoveShouldSetPanResponder: (_evt, gestureState) =>
      Math.abs(gestureState.dx) > 6 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
    onPanResponderTerminationRequest: () => true,
    onPanResponderRelease: (_evt, gestureState) => {
      if (Math.abs(gestureState.dx) < 6 && Math.abs(gestureState.dy) < 6) {
        openLightbox();
        return;
      }
      if (Math.abs(gestureState.dx) > 40 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) {
        stepImage(gestureState.dx > 0 ? -1 : 1);
      }
    },
  });

  // Da o quita el «me gusta» al instante y lo confirma con el servidor (si falla, se deshace).
  async function toggleLike() {
    if (!s || likeBusy || likeCount === null) return;
    const siguiente = !liked;
    const delta = siguiente ? 1 : -1;
    setLikeBusy(true);
    setLiked(siguiente);
    setLikeCount((v) => Math.max(0, (v ?? 0) + delta));
    try {
      const total = await fijarMeGustaServicio(s.id, siguiente);
      if (total === null) throw new Error("no se pudo actualizar el me gusta");
      setLikeCount(total);
      await guardarMeGustaLocal(LIKED_SERVICES_KEY, s.id, siguiente);
      trackEvent("servicio_me_gusta", siguiente ? "Servicio: me gusta" : "Servicio: quita el me gusta", { path: `/servicio/${s.id}` });
    } catch (e) {
      console.error("Error actualizando el me gusta del servicio:", e);
      setLiked(!siguiente);
      setLikeCount((v) => Math.max(0, (v ?? 0) - delta));
    } finally {
      setLikeBusy(false);
    }
  }

  // «Contratar servicio ahora» abre su página (dueño, 2026-11-09), con la opción que tenga elegida.
  function contratar() {
    if (!s) return;
    trackEvent("servicio_contratar", "Servicio: Contratar servicio ahora", { path: `/servicio/${s.id}` });
    router.push(`/contratar/${s.id}${modalidad ? `?opcion=${encodeURIComponent(modalidad)}` : ""}` as any);
  }

  // Dudas, como en producto: primero Blue IA con el servicio como contexto; desde ahí, «Hablar con el equipo» abre el
  // chat de la tienda.
  function preguntar() {
    if (!s) return;
    trackEvent("servicio_preguntar", "Servicio: Preguntar por este servicio", { path: `/servicio/${s.id}` });
    router.push(`/blue-ia?servicio=${encodeURIComponent(s.id)}` as any);
  }

  async function shareService() {
    if (!s) return;

    const url =
      Platform.OS === "web" && typeof window !== "undefined"
        ? window.location.href
        : `https://videojuegoszaragoza.com/servicio/${s.id}`;

    if (Platform.OS !== "web") {
      try {
        await Share.share({ title: s.title, message: `${s.title} · ${fmtEUR(s.priceEUR)} · ${url}`, url });
      } catch {
        // cancelado
      }
      return;
    }

    const nav: any = typeof navigator !== "undefined" ? navigator : null;
    if (nav?.share) {
      try {
        await nav.share({ title: s.title, url });
      } catch {
        // cancelado
      }
      return;
    }
    if (nav?.clipboard?.writeText) {
      try {
        await nav.clipboard.writeText(url);
        setShareFeedback("Enlace copiado");
        setTimeout(() => setShareFeedback(null), 2000);
      } catch {
        // sin permiso de portapapeles
      }
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "#F6FAFD",
          paddingHorizontal: pagePadding,
          paddingTop: isMobile ? 12 : 14,
          paddingBottom: isMobile ? 12 : 14,
          alignItems: "center",
        }}
      >
        <View style={{ width: "100%", maxWidth: 1240 }}>
          <CabeceraMarca onBack={smartBack} />
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <CargaMarca texto="Cargando servicio…" />
        </View>
      ) : err ? (
        <View style={{ padding: pagePadding, paddingTop: 24, gap: 12, alignItems: "center" }}>
          <MarcaAnimada cual="taller" ancho={120} />
          <View style={{ alignItems: "center", gap: 6 }}>
            <Text style={{ color: "#B91C1C", fontWeight: "900", textAlign: "center" }}>
              No se ha podido cargar el servicio
            </Text>
            <Text style={{ color: "#7A271A", lineHeight: 20, textAlign: "center" }}>{err}</Text>
          </View>
          <Pressable
            onPress={() => load()}
            style={({ pressed }) => ({
              opacity: pressed ? 0.88 : 1,
              alignSelf: "center",
              borderRadius: 999,
              paddingVertical: 10,
              paddingHorizontal: 16,
              backgroundColor: COLORS.accent2,
              borderWidth: 1,
              borderColor: COLORS.accentBorder,
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>Reintentar</Text>
          </Pressable>
        </View>
      ) : s ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: pagePadding, paddingBottom: isMobile ? 28 : 36, alignItems: "center" }}
        >
          <View style={{ width: "100%", maxWidth: 1240, gap: 14 }}>
            <View style={{ width: "100%", alignItems: "center" }}>
              <Text
                accessibilityRole="header"
                {...({ "aria-level": 1 } as object)}
                style={{
                  color: COLORS.text,
                  fontSize: isMobile ? 24 : 28,
                  fontWeight: "900",
                  lineHeight: isMobile ? 30 : 32,
                  textAlign: "center",
                }}
                numberOfLines={isMobile ? 3 : 2}
              >
                {s.title}
              </Text>
              <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20, textAlign: "center" }}>
                Servicio profesional · Reparación y limpieza
              </Text>
            </View>

            <View style={{ flexDirection: isWide ? "row" : "column", gap: 14, alignItems: "stretch" }}>
              <View style={{ flex: isWide ? 1.08 : undefined, minWidth: 0 }}>
                <View
                  style={{
                    borderRadius: 24,
                    backgroundColor: COLORS.card,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {selectedImageUrl ? (
                    <View nativeID="servicio-foto" style={{ width: "100%" }} {...mainImagePan.panHandlers}>
                      <SmartImage
                        uri={selectedImageUrl}
                        alt={s.title}
                        ancho={isWide ? 700 : 420}
                        style={{
                          width: "100%",
                          height: isWide ? 520 : isTablet ? 360 : 260,
                          backgroundColor: "#F8FBFE",
                        }}
                        contentFit="contain"
                      />
                    </View>
                  ) : (
                    <View
                      style={{
                        height: isWide ? 520 : isTablet ? 360 : 260,
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 22,
                        backgroundColor: COLORS.bg3,
                      }}
                    >
                      <Ionicons name="construct-outline" size={48} color="rgba(11,33,56,0.2)" />
                      <Text style={{ color: COLORS.text, fontWeight: "900", marginTop: 10, fontSize: isMobile ? 17 : 18 }}>
                        Imagen no disponible
                      </Text>
                      <Text style={{ color: COLORS.muted, marginTop: 6, textAlign: "center", lineHeight: 20, maxWidth: 380 }}>
                        Este servicio todavía no tiene una foto disponible, pero puedes consultar el resto
                        de la información y escribirnos si necesitas más detalles.
                      </Text>
                    </View>
                  )}

                  {/* Con varias fotos: en qué foto se está y, en ordenador, flechas (en el móvil se desliza). */}
                  {selectedImageUrl && imageGallery.length > 1 ? (
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        left: 12,
                        top: 12,
                        paddingVertical: 4,
                        paddingHorizontal: 10,
                        borderRadius: 999,
                        backgroundColor: "rgba(11,33,56,0.60)",
                      }}
                    >
                      <Text nativeID="galeria-posicion" style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>
                        {fotoActual + 1} / {imageGallery.length}
                      </Text>
                    </View>
                  ) : null}

                  {selectedImageUrl && imageGallery.length > 1 && !isMobile
                    ? ([-1, 1] as const).map((paso) => (
                        <Pressable
                          key={paso}
                          onPress={() => stepImage(paso)}
                          accessibilityRole="button"
                          accessibilityLabel={paso < 0 ? "Foto anterior" : "Foto siguiente"}
                          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
                            position: "absolute",
                            top: "50%",
                            marginTop: -22,
                            [paso < 0 ? "left" : "right"]: 12,
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: hovered ? "rgba(11,33,56,0.72)" : "rgba(11,33,56,0.48)",
                            opacity: pressed ? 0.85 : 1,
                          })}
                        >
                          <Ionicons name={paso < 0 ? "chevron-back" : "chevron-forward"} size={22} color="#FFFFFF" />
                        </Pressable>
                      ))
                    : null}

                  {shareFeedback ? (
                    <View
                      style={{
                        position: "absolute",
                        right: 12,
                        bottom: 52,
                        paddingVertical: 6,
                        paddingHorizontal: 12,
                        borderRadius: 999,
                        backgroundColor: "rgba(11,33,56,0.78)",
                      }}
                    >
                      <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>{shareFeedback}</Text>
                    </View>
                  ) : null}

                  <View style={{ position: "absolute", right: 12, bottom: 12, flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={shareService}
                      accessibilityRole="button"
                      accessibilityLabel="Compartir este servicio"
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.85 : 1,
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "rgba(11,33,56,0.60)",
                      })}
                    >
                      <Ionicons name="share-social-outline" size={15} color="#FFFFFF" />
                    </Pressable>

                    {/* «Me gusta», como en producto (solo cuando la base de datos ya los tiene). */}
                    {likeCount !== null ? (
                      <Pressable
                        nativeID="servicio-me-gusta"
                        onPress={toggleLike}
                        disabled={likeBusy}
                        accessibilityRole="button"
                        accessibilityLabel={liked ? "Quitar me gusta" : "Dar me gusta"}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.85 : 1,
                          minWidth: 32,
                          height: 32,
                          borderRadius: 16,
                          paddingHorizontal: 10,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 5,
                          backgroundColor: "rgba(11,33,56,0.60)",
                        })}
                      >
                        <Ionicons name={liked ? "heart" : "heart-outline"} size={15} color={liked ? "#FF5A7A" : "#FFFFFF"} />
                        <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 11 }}>{likeCount}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {imageGallery.length > 1 ? (
                  <ScrollView
                    ref={miniaturasRef}
                    nativeID="galeria-miniaturas"
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    // Miniaturas de ancho fijo: el carrusel encaja en cada una (ancho + hueco de 10).
                    snapToInterval={pasoMiniatura}
                    decelerationRate="fast"
                    onLayout={(e) => {
                      setAnchoMiniaturas(e.nativeEvent.layout.width);
                      cargarMiniaturasHasta(e.nativeEvent.layout.width);
                    }}
                    onScroll={(e) => cargarMiniaturasHasta(e.nativeEvent.contentOffset.x + e.nativeEvent.layoutMeasurement.width)}
                    scrollEventThrottle={64}
                    contentContainerStyle={{ gap: 10, paddingTop: 10, flexGrow: 1, justifyContent: "center" }}
                  >
                    {imageGallery.map((m, i) => {
                      const active = selectedImageUrl === m.publicUrl;
                      return (
                        <Pressable
                          key={m.id}
                          onPress={() => setSelectedImageUrl(m.publicUrl)}
                          accessibilityRole="button"
                          accessibilityLabel={`Ver la foto ${i + 1} de ${imageGallery.length}`}
                          style={({ pressed }) => ({
                            opacity: pressed ? 0.88 : 1,
                            width: ladoMiniatura,
                            height: ladoMiniatura,
                            borderRadius: 16,
                            overflow: "hidden",
                            borderWidth: 2,
                            borderColor: active ? COLORS.accent : COLORS.border,
                            backgroundColor: "#F6FAFD",
                          })}
                        >
                          {/* Carga diferida: solo las miniaturas que se ven (y unas pocas más) piden su foto. */}
                          {i < miniaturasCargadas ? (
                            <SmartImage
                              uri={m.publicUrl}
                              alt={`${s.title} (miniatura ${i + 1})`}
                              ancho={90}
                              contentFit="cover"
                              style={{ width: "100%", height: "100%" }}
                            />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}
              </View>

              <View style={{ flex: isWide ? 0.92 : undefined, minWidth: 0, gap: 14 }}>
                <View style={{ paddingVertical: isMobile ? 4 : 8, gap: 14, alignItems: "center" }}>
                  {/* «Servicio profesional» va ya debajo del título. */}
                  {viewCount !== null && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <Ionicons name="eye-outline" size={14} color={COLORS.muted} />
                      <Text style={{ color: COLORS.muted, fontWeight: "700", fontSize: 12 }}>
                        {viewCount} {viewCount === 1 ? "Visita" : "Visitas"}
                      </Text>
                    </View>
                  )}

                  <Text
                    style={{
                      color: COLORS.accent,
                      fontSize: isMobile ? 28 : 34,
                      fontWeight: "900",
                      lineHeight: isMobile ? 32 : 38,
                      textAlign: "center",
                    }}
                  >
                    {fmtEUR(precioVisible)}
                  </Text>

                  {/* Opciones del servicio (Básica, Completa…): el desplegable del propio móvil (en el iPhone, la rueda
                      de iOS); el precio de arriba es el de la opción elegida. */}
                  {s.modalidades.length ? (
                    <View style={{ width: "100%", maxWidth: 460 }}>
                      <SelectorIOS
                        nativeID="servicio-opcion"
                        label="Elige tu opción"
                        centrado
                        value={modalidad}
                        onChange={elegirModalidad}
                        options={s.modalidades.map((m) => ({ value: m.nombre, label: `${m.nombre} · ${fmtEUR(m.precio_eur)}` }))}
                      />
                    </View>
                  ) : null}

                  {/* La valoración de quienes ya lo contrataron (solo si hay reseñas). */}
                  {media !== null && resenas ? (
                    <Text nativeID="servicio-valoracion" style={{ color: COLORS.text, fontWeight: "800", fontSize: 13.5, textAlign: "center" }}>
                      <Text style={{ color: "#F5A524" }}>★</Text> {media.toFixed(1).replace(".", ",")} · {resenas.length}{" "}
                      {resenas.length === 1 ? "reseña" : "reseñas"} de clientes
                    </Text>
                  ) : null}

                  <View style={{ gap: 10, width: "100%", maxWidth: 460 }}>
                    {/* Acción principal: una sola, clara (como «Comprar ya» en producto). */}
                    <Pressable
                      nativeID="servicio-contratar"
                      onPress={contratar}
                      accessibilityRole="button"
                      accessibilityLabel={`Contratar ${s.title}`}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.9 : 1,
                        borderRadius: 999,
                        minHeight: 52,
                        justifyContent: "center",
                        alignItems: "center",
                        backgroundColor: COLORS.accentDark,
                      })}
                    >
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>Contratar servicio ahora</Text>
                    </Pressable>

                    {/* Dudas: primero Blue IA con el servicio como contexto; desde ahí, el chat con el equipo. */}
                    <Pressable
                      nativeID="servicio-preguntar"
                      onPress={preguntar}
                      accessibilityRole="button"
                      accessibilityLabel="Preguntar por este servicio"
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.88 : 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 7,
                        minHeight: 44,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        backgroundColor: "#FFFFFF",
                      })}
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={16} color={COLORS.text} />
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13.5 }}>Preguntar por este servicio</Text>
                    </Pressable>
                  </View>

                  {/* Ficha con pestañas «Características» y «Descripción», la misma que en producto. */}
                  <FichaProducto
                    key={s.id}
                    prefijo="servicio"
                    caracteristicas={caracteristicas}
                    mantenimiento={null}
                    descripcion={s.description}
                    sinDescripcion={SIN_DESCRIPCION_SERVICIO}
                  />

                  {/* Reseñas de quienes ya lo contrataron (se piden en «Mis seguimientos» al entregarlo). */}
                  {resenas && resenas.length ? (
                    <View nativeID="servicio-resenas" style={{ width: "100%", maxWidth: 520, gap: 4, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#EEF3F8" }}>
                      <Text
                        accessibilityRole="header"
                        {...({ "aria-level": 2 } as object)}
                        style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center", marginBottom: 6 }}
                      >
                        Opiniones de clientes
                      </Text>
                      {resenas.slice(0, 10).map((r, i) => (
                        <View key={r.id} style={{ gap: 3, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: "#EEF3F8" }}>
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                            <Text numberOfLines={1} style={{ flex: 1, color: COLORS.text, fontWeight: "800", fontSize: 14 }}>
                              {r.display_name || "Cliente"}
                            </Text>
                            <Text accessibilityLabel={`${r.rating} de 5 estrellas`} style={{ color: "#F5A524", fontSize: 14 }}>
                              {estrellas(r.rating)}
                            </Text>
                          </View>
                          {r.comment ? <Text style={{ color: COLORS.muted, lineHeight: 20 }}>{r.comment}</Text> : null}
                          <Text style={{ color: COLORS.muted, fontSize: 12 }}>
                            {new Date(r.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            {/* Último botón, como en producto: vuelve a donde estaba (o a Servicios). */}
            <View style={{ alignItems: "center", paddingTop: 8, paddingBottom: 8 }}>
              <Pressable
                nativeID="servicio-volver"
                onPress={smartBack}
                accessibilityRole="button"
                accessibilityLabel="Volver atrás"
                style={({ pressed }) => ({
                  width: "100%",
                  maxWidth: 320,
                  minHeight: 52,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: COLORS.accent,
                  backgroundColor: "#FFFFFF",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
                <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 16 }}>Volver atrás</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      ) : null}

      <ImageLightbox
        visible={lightboxOpen}
        images={lightboxImages}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </View>
  );
}
