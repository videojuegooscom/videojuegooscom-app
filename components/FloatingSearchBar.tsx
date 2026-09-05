/**
 * Qué hace: barra de búsqueda flotante que aparece encima del contenido de
 * la pantalla de inicio, con un botón de "Buscar" (lleva a /catalogo) y un
 * botón de acceso rápido a Blue IA (lleva a /blue-ia). Se puede arrastrar
 * verticalmente y se "engancha" (snap) arriba o abajo de la pantalla.
 *
 * Cómo funciona: usa Animated + PanResponder para el arrastre y el efecto
 * muelle (spring) al soltar, y mide la altura real del teclado/viewport en
 * web para no tapar contenido. Los colores ya siguen el tema claro global
 * (fondo blanco, texto azul marino oscuro).
 * - La prop "hidden" (la controla la pantalla de inicio según la
 *   dirección del scroll) anima un fundido + un pequeño desplazamiento
 *   hacia arriba para ocultarla suavemente sin perder su posición de
 *   arrastre (animatedTop); al volver a "hidden=false" reaparece igual de
 *   suave. Mientras está oculta no intercepta toques (pointerEvents).
 *
 * Conectado con: app/(tabs)/index.tsx → la usa como barra flotante sobre
 * la pantalla de inicio.
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
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";

type SearchSnapPosition = "top" | "bottom";

type FloatingSearchBarProps = {
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
};

const COLORS = {
  textDark: "#0B2138",
  mutedDark: "rgba(11,33,56,0.62)",
  searchBg: "#FFFFFF",
};

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function pushRoute(route: Href) {
  router.push(route);
}

function SearchHeader({ isMobile }: { isMobile: boolean }) {
  return (
    <Pressable
      onPress={() => pushRoute("/catalogo" as Href)}
      style={({ pressed }) => ({
        opacity: pressed ? 0.96 : 1,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#E3EAF2",
        backgroundColor: COLORS.searchBg,
        minHeight: isMobile ? 58 : 64,
        paddingLeft: isMobile ? 16 : 18,
        paddingRight: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
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
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          flex: 1,
          minWidth: 0,
        }}
      >
        <Ionicons
          name="search-outline"
          size={isMobile ? 24 : 27}
          color={COLORS.textDark}
        />

        <Text
          numberOfLines={1}
          style={{
            color: COLORS.mutedDark,
            fontSize: isMobile ? 15 : 16,
            lineHeight: isMobile ? 20 : 22,
            flex: 1,
          }}
        >
          Buscar producto o hacer una pregunta
        </Text>
      </View>

      <Pressable
        onPress={(event) => {
          event.stopPropagation?.();
          pushRoute("/blue-ia" as Href);
        }}
        hitSlop={8}
        style={({ pressed }) => ({
          opacity: pressed ? 0.82 : 1,
          width: isMobile ? 44 : 48,
          height: isMobile ? 44 : 48,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "#E3EAF2",
          backgroundColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        })}
      >
        <Ionicons
          name="sparkles-outline"
          size={isMobile ? 20 : 22}
          color={COLORS.textDark}
        />
      </Pressable>
    </Pressable>
  );
}

export default function FloatingSearchBar({
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
}: FloatingSearchBarProps) {
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
        <SearchHeader isMobile={isMobile} />
      </View>
    </Animated.View>
  );
}