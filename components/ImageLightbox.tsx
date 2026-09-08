// components/ImageLightbox.tsx
/**
 * Qué hace: visor de fotos a pantalla completa con zoom y navegación entre
 * imágenes. Se usa en la ficha de producto (app/producto/[id].tsx) al tocar
 * la foto principal.
 *
 * Cómo funciona: en vez del componente Modal de React Native (da problemas
 * en web) usa una capa absoluta que cubre toda la pantalla, así que hay que
 * montarlo dentro de un contenedor con flex:1 que ya ocupe toda la altura
 * visible (la pantalla raíz de producto/[id].tsx cumple esto).
 *
 * Gestos: pellizcar con dos dedos hace zoom en móvil; un doble toque (o
 * doble clic) alterna entre zoom normal y ampliado; la rueda del ratón
 * también hace zoom en escritorio. Con zoom activo, arrastrar con un dedo
 * (o el ratón) mueve la imagen dentro de los límites del encuadre. Sin
 * zoom, deslizar a los lados —o las flechas del teclado en escritorio—
 * cambia de foto. No usa ninguna librería nueva: todo el gesto está hecho
 * con PanResponder, que ya viene con React Native.
 */
import React, { useEffect, useRef, useState } from "react";
import { Image, Platform, PanResponder, Pressable, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type LightboxImage = {
  id: string;
  url: string;
};

const MAX_SCALE = 4;
const MIN_SCALE = 1;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 280;
const SWIPE_THRESHOLD = 60;
const TAP_MOVE_TOLERANCE = 6;

function distanceBetween(touches: { pageX: number; pageY: number }[]) {
  const [a, b] = touches;
  const dx = a.pageX - b.pageX;
  const dy = a.pageY - b.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function ImageLightbox({
  visible,
  images,
  initialIndex,
  onClose,
}: {
  visible: boolean;
  images: LightboxImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);
  const [, forceRender] = useState(0);

  const scaleRef = useRef(1);
  const translateRef = useRef({ x: 0, y: 0 });
  const pinchRef = useRef({ active: false, startDistance: 0, startScale: 1 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef(0);

  useEffect(() => {
    if (!visible) return;
    setIndex(initialIndex);
    scaleRef.current = 1;
    translateRef.current = { x: 0, y: 0 };
    forceRender((n) => n + 1);
  }, [visible, initialIndex]);

  function update() {
    forceRender((n) => n + 1);
  }

  function boundsFor(scale: number) {
    return {
      maxX: Math.max(0, ((scale - 1) * width) / 2),
      maxY: Math.max(0, ((scale - 1) * height) / 2),
    };
  }

  function setScale(next: number) {
    const clamped = clamp(next, MIN_SCALE, MAX_SCALE);
    scaleRef.current = clamped;
    const { maxX, maxY } = boundsFor(clamped);
    translateRef.current = {
      x: clamp(translateRef.current.x, -maxX, maxX),
      y: clamp(translateRef.current.y, -maxY, maxY),
    };
    update();
  }

  function resetZoom() {
    scaleRef.current = 1;
    translateRef.current = { x: 0, y: 0 };
    update();
  }

  function goTo(nextIndex: number) {
    if (!images.length) return;
    const wrapped = ((nextIndex % images.length) + images.length) % images.length;
    setIndex(wrapped);
    resetZoom();
  }

  function toggleDoubleTapZoom() {
    if (scaleRef.current > 1) resetZoom();
    else setScale(DOUBLE_TAP_SCALE);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gestureState) =>
        Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;

        if (touches && touches.length === 2) {
          pinchRef.current = {
            active: true,
            startDistance: distanceBetween(touches as any),
            startScale: scaleRef.current,
          };
        } else {
          pinchRef.current.active = false;
          panStartRef.current = { ...translateRef.current };
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;

        if (touches && touches.length === 2) {
          if (!pinchRef.current.active) {
            pinchRef.current = {
              active: true,
              startDistance: distanceBetween(touches as any),
              startScale: scaleRef.current,
            };
            return;
          }
          if (pinchRef.current.startDistance > 0) {
            const ratio = distanceBetween(touches as any) / pinchRef.current.startDistance;
            setScale(pinchRef.current.startScale * ratio);
          }
          return;
        }

        if (scaleRef.current > 1) {
          const { maxX, maxY } = boundsFor(scaleRef.current);
          translateRef.current = {
            x: clamp(panStartRef.current.x + gestureState.dx, -maxX, maxX),
            y: clamp(panStartRef.current.y + gestureState.dy, -maxY, maxY),
          };
          update();
        }
      },
      onPanResponderRelease: (_evt, gestureState) => {
        if (pinchRef.current.active) {
          pinchRef.current.active = false;
          return;
        }

        const movedLittle =
          Math.abs(gestureState.dx) < TAP_MOVE_TOLERANCE &&
          Math.abs(gestureState.dy) < TAP_MOVE_TOLERANCE;

        if (movedLittle) {
          const now = Date.now();
          if (now - lastTapRef.current < DOUBLE_TAP_MS) {
            toggleDoubleTapZoom();
            lastTapRef.current = 0;
          } else {
            lastTapRef.current = now;
          }
          return;
        }

        if (
          scaleRef.current <= 1 &&
          Math.abs(gestureState.dx) > SWIPE_THRESHOLD &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
        ) {
          goTo(index + (gestureState.dx > 0 ? -1 : 1));
        }
      },
    })
  ).current;

  useEffect(() => {
    if (!visible || Platform.OS !== "web" || typeof window === "undefined") return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goTo(index - 1);
      if (e.key === "ArrowRight") goTo(index + 1);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, index]);

  if (!visible || !images.length) return null;

  const current = images[Math.min(index, images.length - 1)];

  const webWheelProps: any =
    Platform.OS === "web"
      ? {
          onWheel: (e: any) => {
            e.preventDefault?.();
            setScale(scaleRef.current + (e.deltaY > 0 ? -0.4 : 0.4));
          },
        }
      : {};

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(4,10,18,0.94)",
        zIndex: 9999,
        elevation: 20,
      }}
      {...panResponder.panHandlers}
      {...webWheelProps}
    >
      <Pressable
        onPress={onClose}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.14)",
          zIndex: 2,
        }}
      >
        <Ionicons name="close" size={22} color="#FFFFFF" />
      </Pressable>

      {images.length > 1 ? (
        <View
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.14)",
          }}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>
            {index + 1} / {images.length}
          </Text>
        </View>
      ) : null}

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <Image
          key={current.id}
          source={{ uri: current.url }}
          resizeMode="contain"
          style={{
            width,
            height: height * 0.86,
            transform: [
              { translateX: translateRef.current.x },
              { translateY: translateRef.current.y },
              { scale: scaleRef.current },
            ],
          }}
        />
      </View>

      {images.length > 1 ? (
        <>
          <Pressable
            onPress={() => goTo(index - 1)}
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              marginTop: -22,
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.14)",
            }}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </Pressable>

          <Pressable
            onPress={() => goTo(index + 1)}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              marginTop: -22,
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.14)",
            }}
          >
            <Ionicons name="chevron-forward" size={24} color="#FFFFFF" />
          </Pressable>

          <View
            style={{
              position: "absolute",
              bottom: 20,
              left: 0,
              right: 0,
              flexDirection: "row",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {images.map((img, i) => (
              <View
                key={img.id}
                style={{
                  width: i === index ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === index ? "#FFFFFF" : "rgba(255,255,255,0.4)",
                }}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}
