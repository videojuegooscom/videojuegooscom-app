/**
 * components/CatalogFilters.tsx
 *
 * Qué hace: filtros y orden del catálogo (app/catalogo.tsx). A la vista solo
 * queda el icono de filtros (options-outline, sin burbuja ni contador; en azul
 * si hay filtros activos), a la derecha del buscador (dueño, 2026-11-07).
 * Dentro de una categoría no se ofrece «Plataforma» ni los estados o precios
 * sin ningún producto en ella. Al pulsarlo se abre un panel
 * blanco (deslizable desde abajo en móvil, centrado en escritorio) con TODOS
 * los filtros en chips: plataforma, estado (Nuevo / Segunda mano y su
 * condición detallada), precio y orden, más "Quitar filtros" y "Ver N
 * productos". El precio (mejora 3, 2026-11-14) es una barra de 1 € a 1000 €
 * con dos tiradores (BarraPrecio, sin librerías: dedo, ratón y teclado) que
 * filtra al soltar; «1000 € o más» = sin tope. Los estados son los de
 * products.condition (NEW, LIKE_NEW, GOOD, FAIR, PARTS) y van en la dirección
 * como ?estado=bueno (estadoAUrl / estadoDeUrl), igual que ?precio_min= y
 * ?precio_max= (precioDeUrl).
 *
 * Solo pinta y avisa de los cambios: la pantalla es la que aplica los filtros
 * en la consulta a Supabase (para que la paginación sea correcta). Por eso el
 * número de "Ver N productos" se actualiza solo mientras se eligen filtros.
 *
 * Conectado con: app/catalogo.tsx (único que lo usa) y lib/analytics.ts (trackEvent, para medir el uso).
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, PanResponder, Platform, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from "react-native";
import { trackEvent } from "../lib/analytics";
import { COLORES_TEXTO, TACTIL } from "../constants/theme";

const COLORS = {
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  border: "#E3EAF2",
  chipBg: "#F6FAFD",
  white: "#FFFFFF",
};

export type ConditionFilter = "ALL" | "NEW" | "USED" | "LIKE_NEW" | "GOOD" | "FAIR" | "PARTS";
export type SortKey = "NEWEST" | "PRICE_ASC" | "PRICE_DESC" | "MOST_VIEWED";

export type CatalogCategoryOption = { id: string; name: string; slug: string };

/** Condiciones de segunda mano (todo lo que no es "NEW"). */
export const USED_CONDITIONS = ["LIKE_NEW", "GOOD", "FAIR", "PARTS"] as const;

const USED_DETAIL: { key: ConditionFilter; label: string }[] = [
  { key: "LIKE_NEW", label: "Como nuevo" },
  { key: "GOOD", label: "Bueno" },
  { key: "FAIR", label: "Regular" },
  { key: "PARTS", label: "Para piezas" },
];

/** Nombre de cada estado (los de products.condition: NEW, LIKE_NEW, GOOD, FAIR y PARTS; USED = toda la segunda mano). */
export function nombreEstado(c: ConditionFilter): string {
  if (c === "NEW") return "Nuevo";
  if (c === "USED") return "Segunda mano";
  return USED_DETAIL.find((d) => d.key === c)?.label ?? "Todos";
}

/** El estado en la dirección (?estado=): palabras legibles para que el enlace se pueda compartir. */
const ESTADO_URL: Record<Exclude<ConditionFilter, "ALL">, string> = {
  NEW: "nuevo",
  USED: "segunda-mano",
  LIKE_NEW: "como-nuevo",
  GOOD: "bueno",
  FAIR: "regular",
  PARTS: "para-piezas",
};
export function estadoAUrl(c: ConditionFilter): string | undefined {
  return c === "ALL" ? undefined : ESTADO_URL[c];
}
export function estadoDeUrl(v: string | undefined): ConditionFilter {
  const t = String(v ?? "").trim().toLowerCase();
  const par = (Object.entries(ESTADO_URL) as [Exclude<ConditionFilter, "ALL">, string][]).find(([k, s]) => s === t || k.toLowerCase() === t);
  return par ? par[0] : "ALL";
}

// ---------------------------------------------------------------------------
// Precio: de 1 € a 1000 € con dos tiradores (sin librerías). El máximo en 1000 se lee «1000 € o más» (sin tope).
// Escala cuadrática: la mitad de la barra llega a ~250 €, donde está casi todo, para afinar con el dedo.
// ---------------------------------------------------------------------------

export const PRECIO_MIN = 1;
export const PRECIO_MAX = 1000;

export function precioActivo(min: number, max: number) {
  return min > PRECIO_MIN || max < PRECIO_MAX;
}

export function textoPrecio(min: number, max: number) {
  return `${min} € – ${max >= PRECIO_MAX ? `${PRECIO_MAX} € o más` : `${max} €`}`;
}

/** Un precio de la dirección (?precio_min= / ?precio_max=) dentro de 1–1000; si no vale, el extremo. */
export function precioDeUrl(v: string | undefined, porDefecto: number): number {
  const n = Math.round(Number(String(v ?? "").replace(",", ".")));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? Math.max(PRECIO_MIN, Math.min(PRECIO_MAX, n)) : porDefecto;
}

const limitar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function redondearPrecio(v: number) {
  if (v <= PRECIO_MIN) return PRECIO_MIN;
  if (v >= PRECIO_MAX) return PRECIO_MAX;
  const paso = v < 100 ? 1 : v < 300 ? 5 : 10;
  return limitar(Math.round(v / paso) * paso, PRECIO_MIN, PRECIO_MAX);
}

const fraccionAPrecio = (f: number) => redondearPrecio(PRECIO_MIN + (PRECIO_MAX - PRECIO_MIN) * f * f);
const precioAFraccion = (v: number) => Math.sqrt((limitar(v, PRECIO_MIN, PRECIO_MAX) - PRECIO_MIN) / (PRECIO_MAX - PRECIO_MIN));

/** Lo que se mueve con una flecha del teclado: 1 € hasta 100, 5 € hasta 300 y 10 € después. */
function pasoTeclado(v: number, sube: boolean) {
  if (v < 100 || (!sube && v <= 100)) return 1;
  if (v < 300 || (!sube && v <= 300)) return 5;
  return 10;
}

const TIRADOR = 28;

/**
 * Barra de precio con dos tiradores (mínimo y máximo). Se arrastran con el dedo o el ratón (o se toca la barra y va el
 * más cercano) y, en el ordenador, con el teclado (flechas, RePág/AvPág ±50 €, Inicio/Fin). Al soltar (o 0,5 s
 * después de la última tecla) llama a onCommit; mientras tanto solo cambia el texto «Precio: …».
 */
export function BarraPrecio({ min, max, onCommit }: { min: number; max: number; onCommit: (min: number, max: number) => void }) {
  const [borrador, setBorrador] = useState({ min, max });
  const borradorRef = useRef(borrador);
  useEffect(() => {
    borradorRef.current = { min, max };
    setBorrador({ min, max });
  }, [min, max]);
  const anchoRef = useRef(0);
  const [ancho, setAncho] = useState(0);
  const inicioRef = useRef(0);
  // Dónde empieza la barra en la pantalla (x). En la web el elemento es del DOM y se mide al momento.
  const pistaRef = useRef<View>(null);
  const pistaXRef = useRef(0);
  const medirPista = () => {
    const el = pistaRef.current as unknown as { getBoundingClientRect?: () => { left: number }; measureInWindow?: (cb: (x: number) => void) => void } | null;
    if (el?.getBoundingClientRect) pistaXRef.current = el.getBoundingClientRect().left;
    else el?.measureInWindow?.((x) => (pistaXRef.current = x));
  };
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmarRef = useRef(() => {});
  confirmarRef.current = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    const b = borradorRef.current;
    if (b.min !== min || b.max !== max) onCommit(b.min, b.max);
  };
  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    []
  );

  const poner = (cual: "min" | "max", v: number) => {
    const b = borradorRef.current;
    const nb = cual === "min" ? { ...b, min: limitar(v, PRECIO_MIN, b.max) } : { ...b, max: limitar(v, b.min, PRECIO_MAX) };
    borradorRef.current = nb;
    setBorrador(nb);
  };

  // El tirador sigue al dedo: la posición del toque en la pantalla menos dónde empieza la barra (y lo que el dedo
  // estaba desplazado del centro del tirador al cogerlo, para que no salte).
  const crearPan = (cual: "min" | "max") =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        medirPista();
        const centro = pistaXRef.current + precioAFraccion(borradorRef.current[cual]) * anchoRef.current;
        inicioRef.current = e.nativeEvent.pageX - centro;
      },
      onPanResponderMove: (_, g) => {
        const w = anchoRef.current;
        if (w > 0) poner(cual, fraccionAPrecio(limitar((g.moveX - inicioRef.current - pistaXRef.current) / w, 0, 1)));
      },
      onPanResponderRelease: () => confirmarRef.current(),
      onPanResponderTerminate: () => confirmarRef.current(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const panMin = useMemo(() => crearPan("min"), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const panMax = useMemo(() => crearPan("max"), []);

  const teclado = (cual: "min" | "max") => (e: { nativeEvent?: { key?: string }; key?: string; preventDefault?: () => void }) => {
    const tecla = e.nativeEvent?.key ?? e.key ?? "";
    const v = borradorRef.current[cual];
    let nuevo: number | null = null;
    if (tecla === "ArrowRight" || tecla === "ArrowUp") nuevo = v + pasoTeclado(v, true);
    else if (tecla === "ArrowLeft" || tecla === "ArrowDown") nuevo = v - pasoTeclado(v, false);
    else if (tecla === "PageUp") nuevo = v + 50;
    else if (tecla === "PageDown") nuevo = v - 50;
    else if (tecla === "Home") nuevo = PRECIO_MIN;
    else if (tecla === "End") nuevo = PRECIO_MAX;
    if (nuevo === null) return;
    e.preventDefault?.();
    poner(cual, limitar(nuevo, PRECIO_MIN, PRECIO_MAX));
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => confirmarRef.current(), 500);
  };

  // Tocar la barra: va el tirador más cercano y se aplica.
  const tocarBarra = (x: number) => {
    const w = anchoRef.current;
    if (w <= 0) return;
    const v = fraccionAPrecio(limitar(x / w, 0, 1));
    const b = borradorRef.current;
    poner(Math.abs(v - b.min) <= Math.abs(v - b.max) && v <= b.max ? "min" : "max", v);
    confirmarRef.current();
  };

  const tirador = (cual: "min" | "max") => {
    const v = borrador[cual];
    const izquierda = precioAFraccion(v) * ancho;
    const texto = cual === "max" && v >= PRECIO_MAX ? `${PRECIO_MAX} € o más` : `${v} €`;
    return (
      <View
        key={cual}
        nativeID={`catalogo-precio-${cual}`}
        {...(cual === "min" ? panMin.panHandlers : panMax.panHandlers)}
        focusable
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={cual === "min" ? "Precio mínimo" : "Precio máximo"}
        accessibilityValue={{ min: PRECIO_MIN, max: PRECIO_MAX, now: v, text: texto }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(ev) => {
          const sube = ev.nativeEvent.actionName === "increment";
          poner(cual, limitar(v + (sube ? 1 : -1) * pasoTeclado(v, sube) * 5, PRECIO_MIN, PRECIO_MAX));
          confirmarRef.current();
        }}
        {...({
          onKeyDown: teclado(cual),
          "aria-orientation": "horizontal",
          "aria-valuemin": PRECIO_MIN,
          "aria-valuemax": PRECIO_MAX,
          "aria-valuenow": v,
          "aria-valuetext": texto,
        } as object)}
        style={{
          position: "absolute",
          top: 0,
          left: izquierda,
          width: TACTIL.minimo,
          height: TACTIL.minimo,
          alignItems: "center",
          justifyContent: "center",
          // El de arriba es el que se puede coger cuando los dos coinciden: el mínimo si están a la derecha del todo.
          zIndex: cual === "min" ? (v >= PRECIO_MAX - 10 ? 3 : 2) : 2,
          ...(Platform.OS === "web" ? ({ cursor: "grab", touchAction: "none", userSelect: "none" } as object) : {}),
        }}
      >
        <View
          style={{
            width: TIRADOR,
            height: TIRADOR,
            borderRadius: TIRADOR / 2,
            backgroundColor: COLORS.white,
            borderWidth: 3,
            borderColor: COLORS.accent,
            ...Platform.select<any>({ default: { boxShadow: "0 2px 6px rgba(11,33,56,0.22)" }, ios: { shadowColor: "#0B2138", shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 2 } }),
          }}
        />
      </View>
    );
  };

  const fMin = precioAFraccion(borrador.min) * ancho;
  const fMax = precioAFraccion(borrador.max) * ancho;
  return (
    <View nativeID="catalogo-precio" style={{ width: "100%", maxWidth: 420, alignSelf: "center", gap: 6 }}>
      <Text nativeID="catalogo-precio-texto" style={{ color: COLORS.text, fontWeight: "800", fontSize: 15, textAlign: "center" }}>
        Precio: {textoPrecio(borrador.min, borrador.max)}
      </Text>
      {/* Los tiradores (44 px) caben enteros: la barra empieza y acaba a media zona táctil de los bordes. */}
      <View style={{ height: TACTIL.minimo, paddingHorizontal: TACTIL.minimo / 2, justifyContent: "center" }}>
        <Pressable
          ref={pistaRef}
          accessible={false}
          focusable={false}
          onPress={(e) => {
            medirPista();
            tocarBarra(e.nativeEvent.pageX - pistaXRef.current);
          }}
          onLayout={(e: LayoutChangeEvent) => {
            anchoRef.current = e.nativeEvent.layout.width;
            setAncho(e.nativeEvent.layout.width);
            medirPista();
          }}
          style={{ height: TACTIL.minimo, justifyContent: "center" }}
        >
          <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: COLORS.border }} />
          <View pointerEvents="none" style={{ position: "absolute", left: fMin, width: Math.max(0, fMax - fMin), height: 6, borderRadius: 3, backgroundColor: COLORS.accent }} />
        </Pressable>
        <View pointerEvents="box-none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}>
          {ancho > 0 ? [tirador("min"), tirador("max")] : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: COLORES_TEXTO.secundario, fontSize: 13, fontWeight: "700" }}>1 €</Text>
        <Text style={{ color: COLORES_TEXTO.secundario, fontSize: 13, fontWeight: "700" }}>1000 € o más</Text>
      </View>
    </View>
  );
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "NEWEST", label: "Novedades" },
  { key: "PRICE_ASC", label: "Precio más bajo" },
  { key: "PRICE_DESC", label: "Precio más alto" },
  { key: "MOST_VIEWED", label: "Más vistos" },
];

function softShadow() {
  return Platform.select<any>({
    ios: {
      shadowColor: "#0B2138",
      shadowOpacity: 0.18,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
    },
    android: { elevation: 8 },
    default: { boxShadow: "0 18px 48px rgba(11,33,56,0.18)" },
  });
}

export function Chip({
  label,
  active,
  onPress,
  isMobile,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  isMobile?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => ({
        opacity: pressed ? 0.88 : 1,
        borderRadius: 999,
        paddingVertical: isMobile ? 8 : 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: active ? COLORS.accentBorder : COLORS.border,
        backgroundColor: active ? COLORS.accent2 : COLORS.chipBg,
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: isMobile ? 13 : 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function ChipRow({
  title,
  isMobile,
  children,
  lleno = false,
}: {
  title: string;
  isMobile: boolean;
  children: React.ReactNode;
  /** Lo de dentro ocupa todo el ancho (la barra de precio), en vez de ajustarse a su contenido. */
  lleno?: boolean;
}) {
  return (
    <View style={{ alignItems: lleno ? "stretch" : "center", gap: 8 }}>
      <Text
        style={{
          color: COLORS.muted2,
          fontSize: 12,
          fontWeight: "800",
          letterSpacing: 0.4,
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: isMobile ? 8 : 10,
        }}
      >
        {children}
      </View>
    </View>
  );
}

function productsLabel(total: number) {
  return total === 1 ? "1 producto" : `${total} productos`;
}

/** Lo que hay de verdad en una categoría: sus estados y sus precios (para no ofrecer filtros vacíos). */
export type FiltrosDisponibles = { condiciones: string[]; precios: number[] };

export default function CatalogFilters({
  isMobile,
  categories,
  categoryId,
  onCategoryChange,
  condition,
  onConditionChange,
  priceMin,
  priceMax,
  onPriceCommit,
  sort,
  onSortChange,
  total,
  busy,
  hasActiveFilters,
  onClear,
  extraTitle,
  extraActiveCount = 0,
  extraContent,
  enCategoria = false,
  disponibles = null,
}: {
  isMobile: boolean;
  categories: CatalogCategoryOption[];
  categoryId: string | null;
  onCategoryChange: (cat: CatalogCategoryOption | null) => void;
  condition: ConditionFilter;
  onConditionChange: (c: ConditionFilter) => void;
  /** Precio de 1 a 1000 (1000 = sin tope); onPriceCommit al soltar la barra. */
  priceMin: number;
  priceMax: number;
  onPriceCommit: (min: number, max: number) => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  total: number | null;
  busy: boolean;
  hasActiveFilters: boolean;
  onClear: () => void;
  /** Sección extra opcional dentro del panel (p. ej. estado interno para admin). */
  extraTitle?: string;
  extraActiveCount?: number;
  extraContent?: React.ReactNode;
  /** Dentro de una categoría (?cat=): sin «Plataforma» (ya se está en una) y la categoría no cuenta como filtro. */
  enCategoria?: boolean;
  /** Lo que hay en la categoría: solo se ofrecen los estados y precios con algún producto. null = todo. */
  disponibles?: FiltrosDisponibles | null;
}) {
  const [open, setOpen] = useState(false);
  const usedSelected = condition === "USED" || USED_DETAIL.some((d) => d.key === condition);

  // Filtros activos (el orden no cuenta como filtro; dentro de una categoría, la categoría tampoco).
  const activeCount =
    (categoryId && !enCategoria ? 1 : 0) + (condition !== "ALL" ? 1 : 0) + (precioActivo(priceMin, priceMax) ? 1 : 0) + extraActiveCount;

  const seeLabel = busy || total === null ? "Ver productos" : `Ver ${productsLabel(total)}`;

  // Coherencia con la categoría (dueño, 2026-11-07): solo lo que tiene algún producto (y lo ya elegido, siempre).
  const hay = (c: string) => !disponibles || disponibles.condiciones.includes(c);
  const hayNuevo = hay("NEW");
  const usadosConProductos = USED_DETAIL.filter((d) => hay(d.key) || condition === d.key);
  const haySegundaMano = !disponibles || usadosConProductos.length > 0;
  // Estado: «Nuevo / Segunda mano» si hay de los dos; si todo es de segunda mano, directamente su condición
  // (Como nuevo, Bueno…) cuando hay más de una; con una sola opción no se ofrece.
  const estadoCompleto = hayNuevo && haySegundaMano;
  const soloDetalleUsado = !!disponibles && !hayNuevo && usadosConProductos.length >= 2;
  // La barra de precio sale si hay al menos dos precios distintos (o ya hay un precio elegido).
  const mostrarPrecio = !disponibles || new Set(disponibles.precios).size > 1 || precioActivo(priceMin, priceMax);

  return (
    <View style={{ alignItems: "center" }}>
      {/* Botón de filtros: solo el icono, sin burbuja (como los demás iconos de la app). Con filtros activos, en
          azul de marca. */}
      <Pressable
        nativeID="catalogo-filtros"
        onPress={() => {
          setOpen(true);
          trackEvent("catalogo_filtros", "Filtros: abiertos", { path: "/catalogo", metadata: { en_categoria: enCategoria } });
        }}
        accessibilityRole="button"
        accessibilityLabel={activeCount > 0 ? `Filtros, ${activeCount} activos` : "Filtros"}
        hitSlop={4}
        style={({ pressed }) => ({
          opacity: pressed ? 0.6 : 1,
          width: 48,
          height: 48,
          alignItems: "center",
          justifyContent: "center",
        })}
      >
        {busy ? (
          <ActivityIndicator size="small" color={COLORS.accent} />
        ) : (
          <Ionicons name="options-outline" size={28} color={activeCount > 0 ? COLORS.accent : COLORS.text} />
        )}
      </Pressable>

      {/* Panel de filtros: hoja inferior en móvil, ventana centrada en escritorio. */}
      <Modal
        visible={open}
        transparent
        animationType={isMobile ? "slide" : "fade"}
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: isMobile ? "flex-end" : "center",
            alignItems: "center",
            padding: isMobile ? 0 : 20,
          }}
        >
          {/* Fondo oscuro: tocarlo cierra el panel. */}
          <Pressable
            onPress={() => setOpen(false)}
            accessibilityLabel="Cerrar filtros"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: "rgba(11,33,56,0.45)",
            }}
          />

          <View
            style={{
              width: "100%",
              maxWidth: isMobile ? undefined : 560,
              maxHeight: isMobile ? "88%" : "86%",
              backgroundColor: COLORS.white,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderBottomLeftRadius: isMobile ? 0 : 24,
              borderBottomRightRadius: isMobile ? 0 : 24,
              overflow: "hidden",
              ...softShadow(),
            }}
          >
            {/* Cabecera: asa (móvil), título centrado y X. */}
            <View style={{ alignItems: "center", paddingTop: isMobile ? 10 : 18, paddingBottom: 12 }}>
              {isMobile ? (
                <View
                  style={{
                    width: 40,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: COLORS.border,
                    marginBottom: 10,
                  }}
                />
              ) : null}
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>
                Filtros
              </Text>
              <Pressable
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                hitSlop={10}
                style={({ pressed }) => ({
                  position: "absolute",
                  right: 14,
                  top: isMobile ? 18 : 14,
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? COLORS.chipBg : "transparent",
                })}
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </Pressable>
            </View>

            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={{
                paddingHorizontal: isMobile ? 16 : 24,
                paddingTop: 4,
                paddingBottom: 18,
                gap: 18,
              }}
              showsVerticalScrollIndicator={false}
            >
              {extraContent ? (
                <ChipRow title={extraTitle ?? "Más filtros"} isMobile={isMobile}>
                  {extraContent}
                </ChipRow>
              ) : null}

              {categories.length > 0 && !enCategoria ? (
                <ChipRow title="Plataforma" isMobile={isMobile}>
                  <Chip
                    label="Todas"
                    active={!categoryId}
                    onPress={() => onCategoryChange(null)}
                    isMobile={isMobile}
                  />
                  {categories.map((c) => (
                    <Chip
                      key={c.id}
                      label={c.name}
                      active={categoryId === c.id}
                      onPress={() => onCategoryChange(c)}
                      isMobile={isMobile}
                    />
                  ))}
                </ChipRow>
              ) : null}

              {estadoCompleto ? (
                <ChipRow title="Estado" isMobile={isMobile}>
                  <Chip
                    label="Todos"
                    active={condition === "ALL"}
                    onPress={() => onConditionChange("ALL")}
                    isMobile={isMobile}
                  />
                  <Chip
                    label="Nuevo"
                    active={condition === "NEW"}
                    onPress={() => onConditionChange("NEW")}
                    isMobile={isMobile}
                  />
                  <Chip
                    label="Segunda mano"
                    active={usedSelected}
                    onPress={() => onConditionChange("USED")}
                    isMobile={isMobile}
                  />
                </ChipRow>
              ) : soloDetalleUsado ? (
                // Todo es de segunda mano: se elige directamente cómo está.
                <ChipRow title="Estado" isMobile={isMobile}>
                  <Chip
                    label="Todos"
                    active={condition === "ALL" || condition === "USED"}
                    onPress={() => onConditionChange("ALL")}
                    isMobile={isMobile}
                  />
                  {usadosConProductos.map((d) => (
                    <Chip
                      key={d.key}
                      label={d.label}
                      active={condition === d.key}
                      onPress={() => onConditionChange(condition === d.key ? "ALL" : d.key)}
                      isMobile={isMobile}
                    />
                  ))}
                </ChipRow>
              ) : null}

              {/* Condición detallada: solo aparece al elegir "Segunda mano" (y solo las que tienen productos). */}
              {estadoCompleto && usedSelected && usadosConProductos.length > 1 ? (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: isMobile ? 8 : 10,
                    marginTop: -8,
                  }}
                >
                  {usadosConProductos.map((d) => (
                    <Chip
                      key={d.key}
                      label={d.label}
                      active={condition === d.key}
                      onPress={() => onConditionChange(condition === d.key ? "USED" : d.key)}
                      isMobile={isMobile}
                    />
                  ))}
                </View>
              ) : null}

              {mostrarPrecio ? (
                <ChipRow title="Precio" isMobile={isMobile} lleno>
                  <BarraPrecio min={priceMin} max={priceMax} onCommit={onPriceCommit} />
                </ChipRow>
              ) : null}

              <ChipRow title="Ordenar por" isMobile={isMobile}>
                {SORT_OPTIONS.map((o) => (
                  <Chip
                    key={o.key}
                    label={o.label}
                    active={sort === o.key}
                    onPress={() => onSortChange(o.key)}
                    isMobile={isMobile}
                  />
                ))}
              </ChipRow>
            </ScrollView>

            {/* Pie del panel: quitar filtros + ver resultados. */}
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: COLORS.border,
                paddingHorizontal: isMobile ? 16 : 24,
                paddingTop: 12,
                paddingBottom: isMobile ? 22 : 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
              }}
            >
              {hasActiveFilters ? (
                <Pressable
                  onPress={onClear}
                  accessibilityRole="button"
                  hitSlop={6}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                    paddingVertical: 12,
                    paddingHorizontal: 10,
                  })}
                >
                  <Text style={{ color: COLORS.accent, fontWeight: "900", textAlign: "center" }}>
                    Quitar filtros
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => {
                  setOpen(false);
                  // Analítica propia (Administración → Analítica): filtros aplicados, dentro de una categoría o no, y cuáles.
                  if (activeCount > 0 || sort !== "NEWEST") {
                    trackEvent("catalogo_filtros", enCategoria ? "Filtros: aplicados en una categoría" : "Filtros: aplicados en el catálogo", {
                      path: "/catalogo",
                      metadata: {
                        en_categoria: enCategoria,
                        estado: condition,
                        precio: precioActivo(priceMin, priceMax) ? `${priceMin}-${priceMax >= PRECIO_MAX ? "max" : priceMax}` : "ALL",
                        orden: sort,
                        plataforma: enCategoria ? null : categoryId,
                      },
                    });
                  }
                }}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  opacity: pressed ? 0.9 : 1,
                  flex: 1,
                  maxWidth: 320,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderRadius: 999,
                  paddingVertical: 13,
                  paddingHorizontal: 18,
                  backgroundColor: COLORS.accent,
                })}
              >
                {busy ? <ActivityIndicator size="small" color={COLORS.white} /> : null}
                <Text style={{ color: COLORS.white, fontWeight: "900", textAlign: "center" }}>
                  {seeLabel}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
