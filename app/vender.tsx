// app/vender.tsx
/**
 * Qué hace: página «Vender ahora». Es el formulario de venta de siempre
 * (components/VenderAhoraModal.tsx) pero como página completa en vez de ventana emergente:
 * fondo limpio, más aire entre apartados y recuadros con el texto centrado.
 * Parámetros: ?articulo= (lo que contó la persona a Blue IA o el modelo de su reparación), ?cambio=1 (intercambio) y
 * ?nota= (reparación por envío sin arreglo, «Te lo compramos»: la nota del diagnóstico, que va como el problema).
 * Desde la cesta (mejora 13 «Cambio de consola»): ?cambio=1&desde=cesta&para=<la consola que compra>.
 *
 * Conectado con:
 * - components/VenderAhoraModal.tsx → el formulario (prop comoPagina).
 * - app/(tabs)/index.tsx, components/Campanita.tsx → los botones «Vender ahora» llevan aquí.
 * - app/(tabs)/perfil.tsx → «Te lo compramos» de una reparación sin arreglo.
 * - app/(tabs)/cesta.tsx → «Ver cuánto me dais» (cambio de consola desde la cesta).
 * - app/_layout.tsx → registra la ruta.
 */
import React from "react";
import { router, useLocalSearchParams } from "expo-router";
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
  // Desde los botones de Blue IA (dueño, 2026-11-07): ?articulo= (lo que contó la persona) y ?cambio=1 (intercambio).
  // Desde la cesta (mejora 13, 2026-11-15): ?desde=cesta y ?para= (la consola que compra, de referencia).
  const params = useLocalSearchParams<{ articulo?: string; cambio?: string; nota?: string; desde?: string; para?: string }>();
  const articulo = typeof params.articulo === "string" ? params.articulo.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const cambio = params.cambio === "1";
  const nota = typeof params.nota === "string" ? params.nota.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  const desdeCesta = cambio && params.desde === "cesta";
  const para = desdeCesta && typeof params.para === "string" ? params.para.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) : "";
  return (
    <VenderAhoraModal
      visible
      onClose={volver}
      comoPagina
      articuloInicial={articulo}
      cambio={cambio}
      problemaInicial={nota}
      cambioDesdeCesta={desdeCesta}
      paraComprar={para}
    />
  );
}
