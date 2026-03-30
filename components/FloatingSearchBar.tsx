import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Href } from "expo-router";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Animated,
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
   * TOCA ESTO SI QUIERES MOVER LA POSICIÓN FINAL DE ARRIBA.
   *
   * Menor número = más arriba
   * Mayor número = más abajo
   */
  topSnapY?: number;

  /**
   * ALTURA VISUAL DE LA TAB BAR INFERIOR DE TU APP EN MÓVIL.
   * Si cambias el menú inferior, toca esto.
   */
  mobileTabBarHeight?: number;

  /**
   * ALTURA VISUAL DE LA TAB BAR INFERIOR EN DESKTOP/TABLET.
   */
  desktopTabBarHeight?: number;

  /**
   * SEPARACIÓN ENTRE LA SEARCH BAR Y LA TAB BAR INFERIOR.
   *
   * Menor número = más pegada abajo
   * Mayor número = más arriba
   */
  bottomGapMobile?: number;
  bottomGapDesktop?: number;

  /**
   * ANCHO DE LA SEARCH BAR EN MÓVIL.
   * 0.90 = más ancho
   * 0.80 = más estrecho
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
};

const COLORS = {
  textDark: "#0B1726",
  mutedDark: "rgba(11,23,38,0.70)",
  searchBg: "rgba(255,255,255,0.96)",
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
        borderColor: "rgba(11,23,38,0.16)",
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
          borderColor: "rgba(11,23,38,0.12)",
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

  /**
   * TOCA ESTO SI CAMBIAS LA ALTURA DEL MENÚ INFERIOR.
   * Si ves que la barra queda muy arriba o muy abajo al pegarse abajo,
   * este es uno de los parámetros principales.
   */
  mobileTabBarHeight = 92,
  desktopTabBarHeight = 96,

  /**
   * TOCA ESTO SI QUIERES MÁS O MENOS AIRE SOBRE EL MENÚ INFERIOR.
   * Menor número = más pegada abajo.
   */
  bottomGapMobile = 12,
  bottomGapDesktop = 14,

  widthMobilePercent = 0.86,
  widthDesktopPercent = 0.74,
  maxWidth = 760,
  onSnapChange,
}: FloatingSearchBarProps) {
  const { width, height } = useWindowDimensions();

  const widthSafe = width > 0 ? width : 1024;

  /**
   * ALTURA VISIBLE REAL
   *
   * En móvil web, especialmente Safari, useWindowDimensions().height puede no coincidir
   * con la zona visible real por la UI del navegador.
   *
   * Por eso usamos visualViewport.height cuando exista.
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
   * Mucho mejor que asumir 58/64 a ciegas.
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
   * TOCA ESTO SI QUIERES MOVER LA POSICIÓN SUPERIOR.
   *
   * Menor número = más arriba
   * Mayor número = más abajo
   */
  const resolvedTopSnapY = topSnapY ?? (isMobile ? 84 : 92);

  /**
   * POSICIÓN FINAL INFERIOR
   *
   * altura visible real
   * - altura tab bar
   * - separación respecto a la tab bar
   * - altura real del buscador
   *
   * Esto deja la barra alineada encima del menú inferior de forma mucho más estable.
   *
   * TOCA MANUALMENTE:
   * - mobileTabBarHeight / desktopTabBarHeight
   * - bottomGapMobile / bottomGapDesktop
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

  const [searchSnapPosition, setSearchSnapPosition] =
    useState<SearchSnapPosition>("bottom");

  /**
   * Animamos "top" directamente.
   * Aquí no usamos translateY para evitar desajustes visuales raros en web móvil.
   */
  const animatedTop = useRef(new Animated.Value(resolvedBottomSnapY)).current;
  const dragStartTop = useRef(resolvedBottomSnapY);
  const liveTop = useRef(resolvedBottomSnapY);
  const didInitRef = useRef(false);

  useEffect(() => {
    const id = animatedTop.addListener(({ value }) => {
      liveTop.current = value;
    });

    return () => {
      animatedTop.removeListener(id);
    };
  }, [animatedTop]);

  useEffect(() => {
    const nextTarget =
      searchSnapPosition === "top" ? resolvedTopSnapY : resolvedBottomSnapY;

    if (!didInitRef.current) {
      didInitRef.current = true;
      liveTop.current = nextTarget;
      dragStartTop.current = nextTarget;
      animatedTop.setValue(nextTarget);
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
  }, [animatedTop, resolvedBottomSnapY, resolvedTopSnapY, searchSnapPosition]);

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
      pointerEvents="box-none"
      {...panResponder.panHandlers}
      style={{
        position: "absolute",
        top: animatedTop,
        left: 0,
        right: 0,
        alignItems: "center",
        zIndex: 999,
        elevation: 999,
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