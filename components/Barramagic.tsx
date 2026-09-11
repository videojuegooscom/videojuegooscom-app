/**
 * components/Barramagic.tsx
 *
 * Qué hace: TODO lo relacionado con la barra de búsqueda de la app vive en
 * este único archivo (antes estaba repartido entre este archivo y
 * FloatingSearchBar.tsx, que ya no existe, para no confundirse sobre dónde
 * tocar cada cosa). Exporta dos cosas:
 *
 * - `Barramagic` (export por defecto): la píldora en sí (icono de lupa +
 *   texto/campo + botón ✨ de acceso a Blue IA). Es la pieza visual y se usa
 *   quieta, dentro del scroll normal de una pantalla — así la usa
 *   app/catalogo.tsx.
 * - `FloatingBarramagic` (export con nombre): la misma píldora pero flotando
 *   encima del contenido, arrastrable verticalmente y que se "engancha"
 *   (snap) arriba o abajo, más el ocultado suave al hacer scroll. Así la usa
 *   app/(tabs)/index.tsx (Inicio).
 *
 * Cómo funciona `Barramagic`: tiene dos modos —
 * - mode="input" (por defecto): un TextInput real y controlado
 *   (value/onChangeText/onSubmit), con una "x" para borrar cuando hay texto
 *   escrito. Busca de verdad en la pantalla que la usa (no navega a otro
 *   sitio).
 * - mode="link": no es editable — es un botón que, al tocarlo, llama a
 *   onPress. La usa así FloatingBarramagic, porque en Inicio la búsqueda de
 *   verdad ocurre al entrar en /catalogo.
 * En ambos modos, el botón de la derecha (✨) lleva a /blue-ia salvo que se
 * pase onPressAi con otra acción.
 *
 * Cómo funciona `FloatingBarramagic`: usa Animated + PanResponder para el
 * arrastre y el efecto muelle (spring) al soltar, y mide la altura real del
 * teclado/viewport en web para no tapar contenido. La prop "hidden" (la
 * controla la pantalla que la use, normalmente según la dirección del
 * scroll) anima un fundido + un pequeño desplazamiento hacia arriba para
 * ocultarla suavemente sin perder su posición de arrastre; al volver a
 * "hidden=false" reaparece igual de suave. Mientras está oculta no
 * intercepta toques.
 *
 * Conectado con:
 * - app/(tabs)/index.tsx → usa FloatingBarramagic sobre la pantalla de
 *   inicio.
 * - app/catalogo.tsx → usa Barramagic (modo "input") dentro del scroll.
 *
 * Septiembre (legibilidad en móvil): en pantallas estrechas, el icono de
 * lupa + los espacios fijos dejaban muy poco ancho real al campo de texto,
 * y el placeholder largo de app/catalogo.tsx se cortaba en silencio (un
 * <input> web no pone "..." si no cabe, simplemente recorta). Se redujeron
 * el icono y los huecos en móvil para dar más aire al campo, y
 * app/catalogo.tsx pasa ahora un placeholder más corto en móvil — entre los
 * dos cambios, el texto se lee siempre entero.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Href } from "expo-router";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type ViewStyle,
} from "react-native";

const COLORS = {
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  bg: "#FFFFFF",
  border: "#E3EAF2",
};

function pushRoute(route: Href) {
  router.push(route);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

export type BarramagicProps = {
  isMobile: boolean;

  /** "input" = buscador real y editable. "link" = botón que navega. */
  mode?: "input" | "link";

  /** mode="input": valor controlado del campo. */
  value?: string;
  /** mode="input": se llama al escribir. */
  onChangeText?: (text: string) => void;
  /** mode="input": se llama al pulsar intro/buscar en el teclado. */
  onSubmit?: () => void;
  /** mode="input": se llama al tocar la "x" para borrar (por defecto, deja el campo vacío). */
  onClear?: () => void;

  /** mode="link": se llama al tocar toda la píldora. */
  onPress?: () => void;

  /** Botón ✨: por defecto lleva a /blue-ia. */
  onPressAi?: () => void;

  placeholder?: string;
  style?: ViewStyle;
};

export default function Barramagic({
  isMobile,
  mode = "input",
  value,
  onChangeText,
  onSubmit,
  onClear,
  onPress,
  onPressAi,
  placeholder = "Buscar producto o hacer una pregunta",
  style,
}: BarramagicProps) {
  const handleAiPress = (event?: GestureResponderEvent) => {
    event?.stopPropagation?.();
    if (onPressAi) {
      onPressAi();
      return;
    }
    pushRoute("/blue-ia" as Href);
  };

  const pillStyle: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: isMobile ? 8 : 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    minHeight: isMobile ? 58 : 64,
    paddingLeft: isMobile ? 14 : 18,
    paddingRight: isMobile ? 6 : 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 2 },
      default: {},
    }),
    ...style,
  };

  const aiButton = (
    <Pressable
      onPress={handleAiPress}
      hitSlop={8}
      style={({ pressed }) => ({
        opacity: pressed ? 0.82 : 1,
        width: isMobile ? 40 : 48,
        height: isMobile ? 40 : 48,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.bg,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      })}
    >
      <Ionicons name="sparkles-outline" size={isMobile ? 20 : 22} color={COLORS.text} />
    </Pressable>
  );

  if (mode === "link") {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.96 : 1 })}>
        <View style={pillStyle}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: isMobile ? 8 : 14, flex: 1, minWidth: 0 }}>
            <Ionicons name="search-outline" size={isMobile ? 20 : 27} color={COLORS.text} />
            <Text
              numberOfLines={1}
              // adjustsFontSizeToFit + minimumFontScale: en vez de recortar
              // con "..." cuando el texto no cabe (pantallas móviles
              // estrechas), encoge la letra lo justo para que quepa entera
              // en una sola línea.
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={{
                color: COLORS.muted,
                fontSize: isMobile ? 13.5 : 16,
                lineHeight: isMobile ? 18 : 22,
                flex: 1,
              }}
            >
              {placeholder}
            </Text>
          </View>
          {aiButton}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={pillStyle}>
      {/* gap más ajustado en móvil (antes 14 fijo): en pantallas estrechas
          dejaba muy poco ancho real al campo de texto y el placeholder
          largo ("Buscar consola, videojuego, accesorio...") se cortaba sin
          avisar (un <input> web recorta en silencio si no cabe, no pone
          "..."). Con más ancho disponible para el campo, más el placeholder
          más corto en móvil que se pasa desde cada pantalla, ya se lee
          entero. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: isMobile ? 10 : 14, flex: 1, minWidth: 0 }}>
        <Ionicons name="search-outline" size={isMobile ? 21 : 27} color={COLORS.text} />

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(11,33,56,0.45)"
          style={{
            flex: 1,
            color: COLORS.text,
            fontWeight: "600",
            paddingVertical: 0,
            // 16px fijo (antes 15 en móvil): por debajo de 16, el móvil
            // hace zoom automático al tocar la casilla, y como esto es el
            // buscador de toda la app, ese zoom se notaba en casi
            // cualquier pantalla.
            fontSize: 16,
          }}
          returnKeyType="search"
          onSubmitEditing={onSubmit}
        />

        {value ? (
          <Pressable
            onPress={() => (onClear ? onClear() : onChangeText?.(""))}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Ionicons name="close-circle" size={19} color={COLORS.muted} />
          </Pressable>
        ) : null}
      </View>

      {aiButton}
    </View>
  );
}

// ---------------------------------------------------------------------------
// FloatingBarramagic — la misma píldora, pero flotante/arrastrable (Inicio).
// ---------------------------------------------------------------------------

type SearchSnapPosition = "top" | "bottom";

export type FloatingBarramagicProps = {
  isMobile: boolean;

  /**
   * POSICIÓN FINAL DE ARRIBA.
   * Menor número = más arriba
   * Mayor número = más abajo
   */
  topSnapY?: number;

  /**
   * ALTURA VISUAL DE LA TAB BAR INFERIOR DE TU APP EN MÓVIL.
   */
  mobileTabBarHeight?: number;

  /**
   * ALTURA VISUAL DE LA TAB BAR INFERIOR EN DESKTOP/TABLET.
   */
  desktopTabBarHeight?: number;

  /**
   * SEPARACIÓN ENTRE LA SEARCH BAR Y LA TAB BAR INFERIOR.
   */
  bottomGapMobile?: number;
  bottomGapDesktop?: number;

  /**
   * ANCHO DE LA SEARCH BAR EN MÓVIL.
   */
  widthMobilePercent?: number;

  /**
   * ANCHO DE LA SEARCH BAR EN DESKTOP.
   */
  widthDesktopPercent?: number;

  /**
   * LÍMITE MÁXIMO DE ANCHO.
   */
  maxWidth?: number;

  onSnapChange?: (position: SearchSnapPosition) => void;

  /**
   * true = ocultar con una animación suave (al hacer scroll hacia abajo en
   * la pantalla de inicio). No afecta a su posición de arrastre (top/bottom
   * snap), solo a si se ve o no en este momento.
   */
  hidden?: boolean;

  /** A dónde navega al tocar la píldora (por defecto /catalogo). */
  onPress?: () => void;
  placeholder?: string;
};

export function FloatingBarramagic({
  isMobile,
  topSnapY,
  mobileTabBarHeight = 92,
  desktopTabBarHeight = 96,
  bottomGapMobile = 12,
  bottomGapDesktop = 14,
  widthMobilePercent = 0.86,
  widthDesktopPercent = 0.74,
  maxWidth = 760,
  onSnapChange,
  hidden = false,
  onPress,
  placeholder = "Buscar producto o hacer una pregunta",
}: FloatingBarramagicProps) {
  const { width, height } = useWindowDimensions();
  const widthSafe = width > 0 ? width : 1024;

  /**
   * ALTURA VISIBLE REAL
   * En web móvil usamos visualViewport cuando exista para evitar bailes raros.
   */
  const [viewportHeight, setViewportHeight] = useState<number>(height > 0 ? height : 900);

  useEffect(() => {
    const fallback = height > 0 ? height : 900;

    if (Platform.OS !== "web" || typeof window === "undefined") {
      setViewportHeight(fallback);
      return;
    }

    const readViewportHeight = () => {
      const vv = window.visualViewport;
      const nextHeight =
        typeof vv?.height === "number" && vv.height > 0
          ? vv.height
          : window.innerHeight > 0
          ? window.innerHeight
          : fallback;

      setViewportHeight(nextHeight);
    };

    readViewportHeight();

    const vv = window.visualViewport;
    window.addEventListener("resize", readViewportHeight);
    vv?.addEventListener?.("resize", readViewportHeight);
    vv?.addEventListener?.("scroll", readViewportHeight);

    return () => {
      window.removeEventListener("resize", readViewportHeight);
      vv?.removeEventListener?.("resize", readViewportHeight);
      vv?.removeEventListener?.("scroll", readViewportHeight);
    };
  }, [height]);

  /**
   * ALTURA REAL MEDIDA DE LA SEARCH BAR.
   */
  const estimatedSearchBarHeight = isMobile ? 58 : 64;
  const [measuredSearchBarHeight, setMeasuredSearchBarHeight] =
    useState<number>(estimatedSearchBarHeight);

  const handleSearchLayout = (e: LayoutChangeEvent) => {
    const nextHeight = Math.round(e.nativeEvent.layout.height || estimatedSearchBarHeight);
    if (nextHeight > 0 && nextHeight !== measuredSearchBarHeight) {
      setMeasuredSearchBarHeight(nextHeight);
    }
  };

  /**
   * POSICIÓN DE ARRIBA.
   * POR DEFECTO SIEMPRE ARRANCA ARRIBA.
   */
  const resolvedTopSnapY = topSnapY ?? (isMobile ? 84 : 92);

  /**
   * POSICIÓN DE ABAJO.
   */
  const resolvedBottomSnapY = Math.max(
    resolvedTopSnapY + 80,
    viewportHeight -
      (isMobile ? mobileTabBarHeight : desktopTabBarHeight) -
      (isMobile ? bottomGapMobile : bottomGapDesktop) -
      measuredSearchBarHeight
  );

  const searchBarWidth = useMemo(() => {
    return isMobile
      ? widthSafe * widthMobilePercent
      : Math.min(widthSafe * widthDesktopPercent, maxWidth);
  }, [isMobile, maxWidth, widthDesktopPercent, widthMobilePercent, widthSafe]);

  /**
   * ESTADO INICIAL SIEMPRE EN TOP.
   */
  const [searchSnapPosition, setSearchSnapPosition] =
    useState<SearchSnapPosition>("top");

  /**
   * Arranca visualmente arriba desde el primer render.
   */
  const animatedTop = useRef(new Animated.Value(resolvedTopSnapY)).current;
  const dragStartTop = useRef(resolvedTopSnapY);
  const liveTop = useRef(resolvedTopSnapY);
  const didInitRef = useRef(false);

  useEffect(() => {
    const id = animatedTop.addListener(({ value }) => {
      liveTop.current = value;
    });

    return () => {
      animatedTop.removeListener(id);
    };
  }, [animatedTop]);

  /**
   * Cuando cambian medidas/viewport:
   * - al primer montaje queda arriba sí o sí
   * - después respeta si el usuario la movió arriba o abajo
   */
  useEffect(() => {
    const nextTarget =
      searchSnapPosition === "top" ? resolvedTopSnapY : resolvedBottomSnapY;

    if (!didInitRef.current) {
      didInitRef.current = true;
      liveTop.current = resolvedTopSnapY;
      dragStartTop.current = resolvedTopSnapY;
      animatedTop.setValue(resolvedTopSnapY);
      return;
    }

    liveTop.current = nextTarget;
    dragStartTop.current = nextTarget;

    Animated.spring(animatedTop, {
      toValue: nextTarget,
      useNativeDriver: false,
      damping: 20,
      stiffness: 180,
      mass: 0.9,
      overshootClamping: false,
      restDisplacementThreshold: 0.5,
      restSpeedThreshold: 0.5,
    }).start();
  }, [
    animatedTop,
    resolvedBottomSnapY,
    resolvedTopSnapY,
    searchSnapPosition,
  ]);

  useEffect(() => {
    onSnapChange?.(searchSnapPosition);
  }, [onSnapChange, searchSnapPosition]);

  const snapSearchBar = (target: SearchSnapPosition) => {
    const toValue = target === "top" ? resolvedTopSnapY : resolvedBottomSnapY;

    setSearchSnapPosition(target);
    liveTop.current = toValue;
    dragStartTop.current = toValue;

    Animated.spring(animatedTop, {
      toValue,
      useNativeDriver: false,
      damping: 20,
      stiffness: 180,
      mass: 0.9,
      overshootClamping: false,
      restDisplacementThreshold: 0.5,
      restSpeedThreshold: 0.5,
    }).start();
  };

  /**
   * Ocultado por scroll: fundido + pequeño desplazamiento hacia arriba,
   * independiente de "animatedTop" (que sigue guardando la posición de
   * arrastre top/bottom para cuando vuelva a mostrarse).
   */
  const hideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(hideAnim, {
      toValue: hidden ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [hidden, hideAnim]);

  const hideOpacity = hideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const hideTranslateY = hideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -24] });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return (
            Math.abs(gestureState.dy) > 6 &&
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
          );
        },
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
          return (
            Math.abs(gestureState.dy) > 6 &&
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
          );
        },
        onPanResponderGrant: () => {
          dragStartTop.current = liveTop.current;
        },
        onPanResponderMove: (_, gestureState) => {
          const nextTop = clampNumber(
            dragStartTop.current + gestureState.dy,
            resolvedTopSnapY,
            resolvedBottomSnapY
          );

          liveTop.current = nextTop;
          animatedTop.setValue(nextTop);
        },
        onPanResponderRelease: (_, gestureState) => {
          const currentTop = clampNumber(
            dragStartTop.current + gestureState.dy,
            resolvedTopSnapY,
            resolvedBottomSnapY
          );
          const middle = (resolvedTopSnapY + resolvedBottomSnapY) / 2;
          snapSearchBar(currentTop <= middle ? "top" : "bottom");
        },
        onPanResponderTerminate: (_, gestureState) => {
          const currentTop = clampNumber(
            dragStartTop.current + gestureState.dy,
            resolvedTopSnapY,
            resolvedBottomSnapY
          );
          const middle = (resolvedTopSnapY + resolvedBottomSnapY) / 2;
          snapSearchBar(currentTop <= middle ? "top" : "bottom");
        },
        onPanResponderTerminationRequest: () => true,
        onShouldBlockNativeResponder: () => false,
      }),
    [animatedTop, resolvedBottomSnapY, resolvedTopSnapY]
  );

  return (
    <Animated.View
      pointerEvents={hidden ? "none" : "box-none"}
      {...panResponder.panHandlers}
      style={{
        position: "absolute",
        top: animatedTop,
        left: 0,
        right: 0,
        alignItems: "center",
        zIndex: 999,
        elevation: 999,
        opacity: hideOpacity,
        transform: [{ translateY: hideTranslateY }],
      }}
    >
      <View
        onLayout={handleSearchLayout}
        style={{
          width: searchBarWidth,
          maxWidth,
        }}
      >
        <Barramagic
          isMobile={isMobile}
          mode="link"
          onPress={onPress ?? (() => pushRoute("/catalogo" as Href))}
          placeholder={placeholder}
        />
      </View>
    </Animated.View>
  );
}
