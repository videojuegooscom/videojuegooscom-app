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
} from "react-native";

type SearchSnapPosition = "top" | "bottom";

type FloatingSearchBarProps = {
  isMobile: boolean;
  topSnapY?: number;
  bottomOffsetMobile?: number;
  bottomOffsetDesktop?: number;
  widthMobilePercent?: number;
  widthDesktopPercent?: number;
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
      onPress={() => pushRoute("/catalogo")}
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
            shadowOpacity: 0.10,
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
        onPress={() => pushRoute("/blue-ia")}
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
  bottomOffsetMobile = 166,
  bottomOffsetDesktop = 184,
  widthMobilePercent = 0.86,
  widthDesktopPercent = 0.74,
  maxWidth = 760,
  onSnapChange,
}: FloatingSearchBarProps) {
  const { width, height } = useWindowDimensions();
  const widthSafe = width > 0 ? width : 1024;
  const heightSafe = height > 0 ? height : 900;

  const resolvedTopSnapY = topSnapY ?? (isMobile ? 118 : 132);
  const resolvedBottomSnapY = Math.max(
    resolvedTopSnapY + 80,
    heightSafe - (isMobile ? bottomOffsetMobile : bottomOffsetDesktop)
  );

  const searchBarWidth = useMemo(() => {
    return isMobile
      ? widthSafe * widthMobilePercent
      : Math.min(widthSafe * widthDesktopPercent, maxWidth);
  }, [isMobile, maxWidth, widthDesktopPercent, widthMobilePercent, widthSafe]);

  const [searchSnapPosition, setSearchSnapPosition] =
    useState<SearchSnapPosition>("bottom");

  const searchY = useRef(new Animated.Value(resolvedBottomSnapY)).current;
  const dragStartY = useRef(resolvedBottomSnapY);
  const liveY = useRef(resolvedBottomSnapY);

  useEffect(() => {
    const id = searchY.addListener(({ value }) => {
      liveY.current = value;
    });

    return () => {
      searchY.removeListener(id);
    };
  }, [searchY]);

  useEffect(() => {
    const nextTarget =
      searchSnapPosition === "top" ? resolvedTopSnapY : resolvedBottomSnapY;
    liveY.current = nextTarget;
    searchY.setValue(nextTarget);
  }, [resolvedBottomSnapY, resolvedTopSnapY, searchSnapPosition, searchY]);

  useEffect(() => {
    onSnapChange?.(searchSnapPosition);
  }, [onSnapChange, searchSnapPosition]);

  const snapSearchBar = (target: SearchSnapPosition) => {
    const toValue = target === "top" ? resolvedTopSnapY : resolvedBottomSnapY;
    setSearchSnapPosition(target);

    Animated.spring(searchY, {
      toValue,
      useNativeDriver: true,
      damping: 20,
      stiffness: 180,
      mass: 0.9,
    }).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return (
            Math.abs(gestureState.dy) > 6 &&
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
          );
        },
        onPanResponderGrant: () => {
          dragStartY.current = liveY.current;
        },
        onPanResponderMove: (_, gestureState) => {
          const nextY = clampNumber(
            dragStartY.current + gestureState.dy,
            resolvedTopSnapY,
            resolvedBottomSnapY
          );
          searchY.setValue(nextY);
        },
        onPanResponderRelease: (_, gestureState) => {
          const currentY = clampNumber(
            dragStartY.current + gestureState.dy,
            resolvedTopSnapY,
            resolvedBottomSnapY
          );
          const middle = (resolvedTopSnapY + resolvedBottomSnapY) / 2;
          snapSearchBar(currentY <= middle ? "top" : "bottom");
        },
        onPanResponderTerminate: (_, gestureState) => {
          const currentY = clampNumber(
            dragStartY.current + gestureState.dy,
            resolvedTopSnapY,
            resolvedBottomSnapY
          );
          const middle = (resolvedTopSnapY + resolvedBottomSnapY) / 2;
          snapSearchBar(currentY <= middle ? "top" : "bottom");
        },
      }),
    [resolvedBottomSnapY, resolvedTopSnapY]
  );

  return (
    <Animated.View
      pointerEvents="box-none"
      {...panResponder.panHandlers}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        alignItems: "center",
        transform: [{ translateY: searchY }],
      }}
    >
      <View
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