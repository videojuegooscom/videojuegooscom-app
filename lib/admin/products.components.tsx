/**
 * Qué hace: componentes visuales reutilizables del panel de administración:
 * cabecera de pantalla (AdminHeader: franja fija con volver al panel +
 * título centrado), texto de presentación (AdminIntro), carga a pantalla
 * completa con la mascota (AdminLoading → components/marca/CargaMarca),
 * botón principal (PrimaryButton), aviso de error/éxito (AdminNotice),
 * estado vacío (EmptyState), título de sección (SectionTitle), tarjeta de
 * estadística (StatCard), botones tipo chip (ChipButton), botones solo con
 * icono (IconButton, 44 px, con su nombre para lectores de pantalla), el
 * botón redondo flotante abajo a la derecha (BotonFlotante, p. ej. «+»
 * para crear), filtros tipo píldora (FilterPill), la miniatura de
 * foto/vídeo de un producto (MediaThumb) y las pestañas de una pantalla
 * (PestanasPanel, con subrayado como en Perfil) con su gesto de deslizar
 * el dedo para pasar a la siguiente, en bucle (useGestoPestanas).
 *
 * Cómo funciona: son componentes de presentación puros (sin llamadas a
 * Supabase); reciben props y pintan según la paleta COLORS del tema claro
 * global (fondo blanco, azul claro de acento, texto azul marino oscuro).
 * MediaThumb además distingue entre foto y vídeo (icono, insignia de
 * "IMAGEN"/"VÍDEO" y duración) y funciona tanto con archivos ya subidos a
 * Supabase como con archivos locales todavía sin subir.
 *
 * Conectado con:
 * - app/admin/products/products.constants.ts → de donde viene COLORS.
 * - app/admin/products/products.types.ts → tipos LocalPickedMedia,
 *   ProductMediaRow, ProductMediaKind usados por MediaThumb.
 * - app/admin/products/products.utils.ts → smartBackAdminHome (botón volver).
 * - app/admin/products.tsx → pantalla principal que usa todos estos
 *   componentes para construir la lista y el formulario de productos.
 * - app/admin/services.tsx, categories.tsx, inventario.tsx,
 *   cotizaciones.tsx e index.tsx → usan AdminHeader, PrimaryButton,
 *   AdminNotice, EmptyState y StatCard para que todas las pestañas del
 *   panel se vean iguales.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, PanResponder, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import CargaMarca from "../../components/marca/CargaMarca";
import { COLORS } from "./products.constants";
import type { LocalPickedMedia, ProductMediaRow, ProductMediaKind } from "./products.types";
import { smartBackAdminHome } from "./products.utils";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

// Azul de los botones principales: el mismo de "Comprar ya" en la ficha y
// del botón de pago. El azul de marca (#1EA7E8) sigue en acentos y chips.
export const PRIMARY_BUTTON = "#1EA7E8";

// Cabecera común de cada pestaña del panel, igual que en el resto de
// pantallas de app/admin: franja fija y compacta con la flecha para volver
// (a la izquierda) y el título centrado. Va FUERA del ScrollView; lo demás
// (subtítulo, contadores, buscador, lista) va dentro del scroll.
export function AdminHeader({
  title,
  isMobile,
  maxWidth = 1040,
  onBack = smartBackAdminHome,
  backLabel = "Volver al panel",
}: {
  title: string;
  isMobile?: boolean;
  maxWidth?: number;
  onBack?: () => void;
  backLabel?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        backgroundColor: COLORS.bg2,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        paddingHorizontal: isMobile ? 12 : 16,
        paddingTop: (isMobile ? 10 : 12) + insets.top,
        paddingBottom: isMobile ? 10 : 12,
      }}
    >
      <View style={{ width: "100%", maxWidth, alignSelf: "center", minHeight: 40, justifyContent: "center" }}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          hitSlop={8}
          style={({ pressed }) => ({
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 40,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
            zIndex: 1,
          })}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text
          numberOfLines={2}
          style={{
            color: COLORS.text,
            fontSize: isMobile ? 19 : 22,
            fontWeight: "900",
            textAlign: "center",
            paddingHorizontal: 44,
          }}
        >
          {title}
        </Text>
      </View>
    </View>
  );
}

// Texto de presentación bajo la cabecera (primera línea dentro del scroll).
export function AdminIntro({ text }: { text: string }) {
  return <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>{text}</Text>;
}

// Estado de carga a pantalla completa bajo la cabecera: la mascota centrada.
export function AdminLoading({ texto }: { texto: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <CargaMarca texto={texto} />
    </View>
  );
}

// Botón principal (crear, guardar...): azul de botón, texto blanco centrado.
export function PrimaryButton({
  label,
  onPress,
  disabled,
  fullWidth,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!!disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        width: "100%",
        maxWidth: fullWidth ? undefined : 420,
        alignSelf: "center",
        minHeight: 48,
        borderRadius: 999,
        paddingVertical: 12,
        paddingHorizontal: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: PRIMARY_BUTTON,
        opacity: disabled ? 0.6 : pressed ? 0.9 : 1,
      })}
    >
      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15, textAlign: "center" }}>
        {label}
      </Text>
    </Pressable>
  );
}

// Aviso de error / advertencia / éxito, con el texto centrado.
export function AdminNotice({
  tone,
  title,
  text,
}: {
  tone: "danger" | "warning" | "success";
  title?: string;
  text: string;
}) {
  const color = tone === "danger" ? COLORS.danger : tone === "warning" ? COLORS.warning : COLORS.success;
  const backgroundColor =
    tone === "danger" ? COLORS.dangerBg : tone === "warning" ? COLORS.warningBg : COLORS.successBg;

  return (
    <View style={{ borderRadius: 14, backgroundColor, paddingVertical: 10, paddingHorizontal: 12, gap: 4 }}>
      {!!title && (
        <Text style={{ color, fontWeight: "900", lineHeight: 20, textAlign: "center" }}>{title}</Text>
      )}
      <Text style={{ color, fontWeight: title ? "600" : "800", lineHeight: 20, textAlign: "center" }}>
        {text}
      </Text>
    </View>
  );
}

// Estado vacío de una lista: icono, título y explicación, todo centrado.
export function EmptyState({
  icon,
  title,
  text,
}: {
  icon?: IoniconName;
  title: string;
  text?: string;
}) {
  return (
    <View style={{ alignItems: "center", gap: 8, paddingVertical: 28, paddingHorizontal: 16 }}>
      {icon ? <Ionicons name={icon} size={28} color={COLORS.muted2} /> : null}
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>{title}</Text>
      {!!text && (
        <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center", maxWidth: 520 }}>{text}</Text>
      )}
    </View>
  );
}

type MediaLike = ProductMediaRow | LocalPickedMedia;

function normalizeMediaKind(value: unknown): ProductMediaKind | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "image") return "image";
  if (v === "video") return "video";
  return null;
}

function getMediaKind(media: MediaLike): ProductMediaKind | null {
  if ("file" in media) return media.kind;
  return normalizeMediaKind(media.kind ?? media.media_type);
}

function getMediaName(media: MediaLike) {
  const kind = getMediaKind(media);

  if ("file" in media) {
    return media.name || (kind === "video" ? "Vídeo" : "Imagen");
  }

  return media.file_name || (kind === "video" ? "Vídeo" : "Imagen");
}

function getMediaDuration(media: MediaLike) {
  if ("file" in media) return media.durationSeconds ?? null;

  const raw = media.duration_seconds ?? media.duration_sec ?? null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getMediaUrl(media: MediaLike) {
  if ("file" in media) return media.previewUrl;
  const url = String(media.public_url ?? "").trim();
  return url || null;
}

function formatDuration(seconds: number | null) {
  if (!seconds || !Number.isFinite(seconds)) return null;
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins <= 0) return `${secs}s`;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function SectionTitle({
  title,
  subtitle,
  isMobile,
}: {
  title: string;
  subtitle?: string;
  isMobile?: boolean;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "900",
          fontSize: isMobile ? 17 : 18,
          lineHeight: isMobile ? 22 : 24,
        }}
      >
        {title}
      </Text>

      {!!subtitle && (
        <Text
          style={{
            color: COLORS.muted,
            marginTop: 4,
            lineHeight: 19,
          }}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}

export function StatCard({
  label,
  value,
  icon,
  isMobile,
  columns,
}: {
  label: string;
  value: string;
  icon?: IoniconName;
  isMobile?: boolean;
  // Tarjetas por fila: por defecto 2 en móvil y 4 en pantallas anchas.
  columns?: 2 | 3 | 4;
}) {
  const cols = columns ?? (isMobile ? 2 : 4);
  // flexBasis + flexGrow (en vez de anchos fijos en %) para que la rejilla
  // nunca se desborde por el hueco entre tarjetas en móviles estrechos.
  const basis = cols === 2 ? "40%" : cols === 3 ? "28%" : "20%";
  // Cuatro en una fila del móvil (dueño, 2026-11-03: «en fila horizontal… así hacemos espacio»): el icono encima del
  // nombre, todo más pequeño, para que quepa sin cortarse.
  const estrecha = !!isMobile && cols === 4;

  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: basis,
        minWidth: 0,
        borderRadius: estrecha ? 14 : 18,
        backgroundColor: COLORS.cardSoft,
        paddingVertical: estrecha ? 8 : isMobile ? 10 : 14,
        paddingHorizontal: estrecha ? 4 : 10,
        alignItems: "center",
      }}
    >
      <View style={{ flexDirection: estrecha ? "column" : "row", alignItems: "center", justifyContent: "center", gap: estrecha ? 2 : 6 }}>
        {icon ? <Ionicons name={icon} size={13} color={COLORS.muted2} /> : null}
        <Text
          style={{ color: COLORS.muted2, fontWeight: "700", fontSize: estrecha ? 11 : 12, textAlign: "center", flexShrink: 1 }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>

      <Text
        style={{
          color: COLORS.text,
          fontWeight: "900",
          fontSize: estrecha ? 17 : isMobile ? 18 : 20,
          marginTop: estrecha ? 2 : 6,
          textAlign: "center",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

// Pestañas de una pantalla del panel: texto con subrayado azul en la activa, sin cápsulas (como «Mi cuenta / Mis
// seguimientos» en Perfil).
export function PestanasPanel<T extends string>({
  pestanas,
  actual,
  onChange,
  nativeID,
}: {
  pestanas: { key: T; label: string }[];
  actual: T;
  onChange: (t: T) => void;
  nativeID?: string;
}) {
  return (
    <View nativeID={nativeID} role="tablist" style={{ flexDirection: "row", justifyContent: "center", gap: 28, paddingTop: 2 }}>
      {pestanas.map((t) => {
        const activa = actual === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            role="tab"
            aria-selected={activa}
            style={({ pressed }) => ({ alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={{ color: activa ? COLORS.text : COLORS.muted, fontWeight: "900", fontSize: 15 }}>{t.label}</Text>
            <View style={{ height: 3, width: 28, borderRadius: 2, backgroundColor: activa ? COLORS.accent : "transparent" }} />
          </Pressable>
        );
      })}
    </View>
  );
}

// Deslizar el dedo a la izquierda o a la derecha sobre el contenido para pasar a la pestaña siguiente o a la anterior,
// en bucle (dueño, 2026-11-03: «si no hay más, que sea en bucle»). Lo mismo que el gesto de Perfil: en la web se mira el
// dedo de verdad (la página no se mueve arriba o abajo mientras se desliza en horizontal; en vertical, desplaza como
// siempre), cambia con 60 px o con un deslizamiento corto y rápido, y el contenido acompaña un poco al dedo. Devuelve lo
// que hay que poner en la zona deslizable: ref, panHandlers y el desplazamiento animado (translateX).
export function useGestoPestanas<T extends string>(pestanas: readonly T[], actual: T, cambiar: (t: T, como: "deslizar") => void) {
  const [desliz] = useState(() => new Animated.Value(0));
  const actualRef = useRef(actual);
  actualRef.current = actual;
  const pestanasRef = useRef(pestanas);
  pestanasRef.current = pestanas;
  const cambiarRef = useRef(cambiar);
  cambiarRef.current = cambiar;
  const soltar = useCallback(
    (dx: number, vx: number) => {
      const lista = pestanasRef.current;
      const rapido = Math.abs(dx) > 24 && Math.abs(vx) > 0.35 && Math.sign(vx) === Math.sign(dx);
      if (lista.length > 1 && (Math.abs(dx) > 60 || rapido)) {
        const i = Math.max(0, lista.indexOf(actualRef.current));
        // Hacia la izquierda, la siguiente; hacia la derecha, la anterior; al final, vuelve a empezar.
        const destino = lista[(i + (dx < 0 ? 1 : -1) + lista.length) % lista.length];
        actualRef.current = destino;
        cambiarRef.current(destino, "deslizar");
        desliz.setValue(dx < 0 ? 70 : -70);
      }
      Animated.spring(desliz, { toValue: 0, useNativeDriver: false, speed: 18, bounciness: 4 }).start();
    },
    [desliz]
  );
  const ref = useRef<View>(null);
  const dedo = useRef<{ x0: number; y0: number; eje: "h" | "v" | null; muestras: { x: number; t: number }[]; reconocido: boolean }>({
    x0: 0,
    y0: 0,
    eje: null,
    muestras: [],
    reconocido: false,
  });
  const recorrido = useCallback(() => {
    const d = dedo.current;
    const ultima = d.muestras[d.muestras.length - 1];
    if (!ultima || d.muestras.length < 2) return null;
    const antes = d.muestras.find((m) => ultima.t - m.t <= 100) ?? ultima;
    return { dx: ultima.x - d.x0, vx: ultima.t > antes.t ? (ultima.x - antes.x) / (ultima.t - antes.t) : 0 };
  }, []);
  useEffect(() => {
    const zona = ref.current as unknown as HTMLElement | null;
    if (Platform.OS !== "web" || !zona?.addEventListener) return;
    const inicio = (e: TouchEvent) => {
      const t = e.touches[0];
      dedo.current = {
        x0: t?.clientX ?? 0,
        y0: t?.clientY ?? 0,
        eje: e.touches.length === 1 ? null : "v",
        muestras: t ? [{ x: t.clientX, t: e.timeStamp }] : [],
        reconocido: false,
      };
    };
    const mover = (e: TouchEvent) => {
      const d = dedo.current;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      d.muestras.push({ x: t.clientX, t: e.timeStamp });
      if (d.muestras.length > 8) d.muestras.shift();
      const dx = t.clientX - d.x0;
      const dy = t.clientY - d.y0;
      if (d.eje === null && Math.hypot(dx, dy) >= 8) d.eje = Math.abs(dx) > Math.abs(dy) * 1.2 ? "h" : "v";
      if (d.eje === "h" && e.cancelable) e.preventDefault();
    };
    const fin = () => {
      const r = recorrido();
      if (dedo.current.eje === "h" && !dedo.current.reconocido && r) soltar(r.dx, r.vx);
    };
    zona.addEventListener("touchstart", inicio, { passive: true });
    zona.addEventListener("touchmove", mover, { passive: false });
    zona.addEventListener("touchend", fin);
    return () => {
      zona.removeEventListener("touchstart", inicio);
      zona.removeEventListener("touchmove", mover);
      zona.removeEventListener("touchend", fin);
    };
  }, [recorrido, soltar]);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => {
          if (Platform.OS !== "web") return Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 2;
          const eje = dedo.current.eje ?? (Math.hypot(g.dx, g.dy) >= 8 ? (Math.abs(g.dx) > Math.abs(g.dy) * 1.2 ? "h" : "v") : null);
          return eje === "h";
        },
        onPanResponderGrant: () => {
          dedo.current.reconocido = true;
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => {
          const dx = recorrido()?.dx ?? g.dx;
          desliz.setValue(Math.max(-90, Math.min(90, dx * 0.35)));
        },
        onPanResponderRelease: (_e, g) => {
          const r = recorrido() ?? { dx: g.dx, vx: g.vx };
          soltar(r.dx, r.vx);
        },
        onPanResponderTerminate: () => {
          Animated.spring(desliz, { toValue: 0, useNativeDriver: false }).start();
        },
      }),
    [desliz, recorrido, soltar]
  );
  return { ref, panHandlers: responder.panHandlers, desliz };
}

export function ChipButton({
  label,
  onPress,
  variant,
  disabled,
  isMobile,
  fullWidth,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "success" | "danger" | "ghost";
  disabled?: boolean;
  isMobile?: boolean;
  fullWidth?: boolean;
}) {
  const isPrimary = variant === "primary";
  const isSuccess = variant === "success";
  const isDanger = variant === "danger";

  const borderColor = isPrimary
    ? COLORS.accentBorder
    : isSuccess
      ? COLORS.successBorder
      : isDanger
        ? COLORS.dangerBorder
        : COLORS.border;

  const backgroundColor = isPrimary
    ? COLORS.accent2
    : isSuccess
      ? COLORS.successBg
      : isDanger
        ? COLORS.dangerBg
        : "#F6FAFD";

  return (
    <Pressable
      disabled={!!disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor,
        backgroundColor,
        opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
        width: fullWidth ? "100%" : undefined,
      })}
    >
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "900",
          textAlign: "center",
          fontSize: isMobile ? 13 : 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Botón de acción solo con icono (petición del dueño, 2026-11-01: en el panel, los botones que puedan ser un icono, con
// icono): 44 × 44 para el pulgar, el nombre para los lectores de pantalla y, en el ordenador, al pasar el ratón.
export function IconButton({
  icon,
  label,
  onPress,
  variant = "ghost",
  disabled,
  nativeID,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
  variant?: "primary" | "success" | "danger" | "ghost";
  disabled?: boolean;
  nativeID?: string;
}) {
  const tono =
    variant === "primary"
      ? { borde: COLORS.accentBorder, fondo: COLORS.accent2, icono: COLORS.accent }
      : variant === "success"
        ? { borde: COLORS.successBorder, fondo: COLORS.successBg, icono: COLORS.success }
        : variant === "danger"
          ? { borde: COLORS.dangerBorder, fondo: COLORS.dangerBg, icono: COLORS.danger }
          : { borde: COLORS.border, fondo: "#F6FAFD", icono: COLORS.text };
  return (
    <Pressable
      nativeID={nativeID}
      disabled={!!disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...({ title: label } as object)}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: tono.borde,
        backgroundColor: tono.fondo,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}
    >
      <Ionicons name={icon} size={20} color={tono.icono} />
    </Pressable>
  );
}

// Botón redondo flotante abajo a la derecha (al alcance del pulgar; Blue nunca va ahí), p. ej. «+» para crear. La
// pantalla deja sitio debajo de su lista para que no tape lo último.
export function BotonFlotante({
  icon = "add",
  label,
  onPress,
  nativeID,
}: {
  icon?: IoniconName;
  label: string;
  onPress: () => void;
  nativeID?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...({ title: label } as object)}
      style={({ pressed }) => ({
        position: "absolute",
        right: 16,
        bottom: 16 + insets.bottom,
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: PRIMARY_BUTTON,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#0B2138",
        shadowOpacity: 0.22,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
        opacity: pressed ? 0.9 : 1,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}
    >
      <Ionicons name={icon} size={30} color="#FFFFFF" />
    </Pressable>
  );
}

export function FilterPill({
  label,
  active,
  onPress,
  isMobile,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  isMobile?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: active ? COLORS.accentBorder : "#E3EAF2",
        backgroundColor: active ? COLORS.accent2 : "#F6FAFD",
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "900",
          fontSize: isMobile ? 13 : 14,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function MediaThumb({
  media,
  isMobile,
  onRemove,
}: {
  media: ProductMediaRow | LocalPickedMedia;
  isMobile?: boolean;
  onRemove?: () => void;
}) {
  const kind = getMediaKind(media);
  const mediaName = getMediaName(media);
  const duration = formatDuration(getMediaDuration(media));
  const mediaUrl = getMediaUrl(media);

  const imageSource =
    kind === "image" && mediaUrl
      ? {
          uri: mediaUrl,
        }
      : null;

  const cardWidth = isMobile ? 112 : 128;
  const thumbHeight = isMobile ? 90 : 104;

  return (
    <View
      style={{
        width: cardWidth,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: "#F8FBFE",
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: "100%",
          height: thumbHeight,
          backgroundColor: "#F8FBFE",
          position: "relative",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {kind === "image" && imageSource ? (
          <Image
            source={imageSource}
            resizeMode="cover"
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Ionicons
              name={kind === "video" ? "videocam-outline" : "image-outline"}
              size={28}
              color={COLORS.muted2}
            />
            <Text
              style={{
                color: COLORS.text,
                fontWeight: "900",
                fontSize: 11,
              }}
            >
              {kind === "video" ? "Vídeo" : "Sin vista previa"}
            </Text>
          </View>
        )}

        <View
          style={{
            position: "absolute",
            left: 8,
            top: 8,
            borderRadius: 999,
            paddingVertical: 4,
            paddingHorizontal: 8,
            backgroundColor: kind === "image" ? COLORS.accent2 : "#FBF0D9",
            borderWidth: 1,
            borderColor: kind === "image" ? COLORS.accentBorder : "#EAD08A",
          }}
        >
          <Text
            style={{
              color: COLORS.text,
              fontWeight: "900",
              fontSize: 10,
            }}
          >
            {kind === "image" ? "IMAGEN" : kind === "video" ? "VÍDEO" : "MULTIMEDIA"}
          </Text>
        </View>

        {!!duration && kind === "video" && (
          <View
            style={{
              position: "absolute",
              right: 8,
              bottom: 8,
              borderRadius: 999,
              paddingVertical: 4,
              paddingHorizontal: 8,
              backgroundColor: "rgba(0,0,0,0.58)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontWeight: "900",
                fontSize: 10,
              }}
            >
              {duration}
            </Text>
          </View>
        )}
      </View>

      <View
        style={{
          padding: 8,
          gap: 6,
        }}
      >
        <Text
          numberOfLines={2}
          style={{
            color: COLORS.text,
            fontSize: 11,
            fontWeight: "900",
            lineHeight: 14,
            minHeight: 28,
          }}
        >
          {mediaName}
        </Text>

        <Text
          style={{
            color: COLORS.muted2,
            fontSize: 10,
            fontWeight: "700",
          }}
        >
          {kind === "image"
            ? "Foto del producto"
            : kind === "video"
              ? "Vídeo del producto"
              : "Archivo multimedia del producto"}
        </Text>

        {!!onRemove && (
          <View style={{ alignItems: "center", marginTop: 2 }}>
            <IconButton
              icon="trash-outline"
              label={kind === "video" ? "Quitar el vídeo" : "Quitar la foto"}
              variant="danger"
              onPress={onRemove}
            />
          </View>
        )}
      </View>
    </View>
  );
}