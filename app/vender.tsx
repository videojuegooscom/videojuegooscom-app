// app/vender.tsx
/**
 * Qué hace: página «Vender ahora». Es el formulario de venta de siempre
 * (components/VenderAhoraModal.tsx) pero como página completa en vez de ventana emergente:
 * fondo limpio, más aire entre apartados y recuadros con el texto centrado.
 *
 * Conectado con:
 * - components/VenderAhoraModal.tsx → el formulario (prop comoPagina).
 * - app/(tabs)/index.tsx, components/Campanita.tsx → los botones «Vender ahora» llevan aquí.
 * - app/_layout.tsx → registra la ruta.
 */
import React from "react";
import { router } from "expo-router";
import VenderAhoraModal from "../components/VenderAhoraModal";

function volver() {
  try {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // sin historial: se va a Inicio
  }
  router.replace("/");
}

export default function VenderScreen() {
  return <VenderAhoraModal visible onClose={volver} comoPagina />;
}
