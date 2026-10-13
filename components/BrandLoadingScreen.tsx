/**
 * Qué hace: pantalla de carga de marca que se muestra al arrancar la app, solo
 * mientras llega la fuente de iconos (máx. 1,5 s; ver app/_layout.tsx), antes de
 * montar la navegación.
 *
 * Cómo funciona: logo de la tienda girando/latiendo suavemente y la mascota dando
 * saltitos (components/marca/), con imágenes pequeñas para que aparezcan al
 * instante. Fondo blanco, todo centrado. No depende de datos ni de Supabase.
 *
 * Conectado con:
 * - app/_layout.tsx → la muestra mientras bootLoading es true.
 */
import React from "react";
import { View } from "react-native";
import CargaMarca from "./marca/CargaMarca";
import MarcaAnimada from "./marca/MarcaAnimada";

type BrandLoadingScreenProps = {
  message?: string;
};

export default function BrandLoadingScreen({ message = "Cargando tienda..." }: BrandLoadingScreenProps) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#FFFFFF",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        gap: 8,
      }}
    >
      <MarcaAnimada cual="logo-mini" ancho={132} />
      <CargaMarca texto={message} ancho={84} />
    </View>
  );
}
