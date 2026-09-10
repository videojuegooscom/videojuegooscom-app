// components/SmartImage.tsx
/**
 * Qué hace: sustituto de <Image> de "react-native" para TODAS las fotos
 * remotas de la app (catálogo, producto, servicios, reseñas, lightbox,
 * categorías/servicios del admin...). El objetivo es que cargar fotos nunca
 * se sienta como que la app se ha quedado "congelada": en vez de un hueco en
 * blanco que aparece de golpe cuando la foto por fin llega, se ve un fundido
 * suave — y la navegación y los toques siguen funcionando con normalidad
 * mientras tanto, porque la carga de imágenes siempre ha sido asíncrona (el
 * "congelado" que se notaba era el salto visual brusco, no un bloqueo real).
 *
 * Cómo funciona: es una envoltura fina sobre expo-image (ya era una
 * dependencia del proyecto — "expo-image" en package.json —, no se ha
 * instalado nada nuevo). Aporta, con los mismos valores en todos los sitios:
 * - cachePolicy="memory-disk": una foto que ya se vio una vez (por ejemplo
 *   en catálogo) no se vuelve a descargar al verla otra vez en la ficha de
 *   producto o en el carrito — aparece al instante.
 * - transition: fundido de entrada de 250ms en vez de aparición brusca.
 * - recyclingKey={uri}: si una tarjeta cambia de foto (p. ej. al recorrer
 *   una lista), no se ve un instante la foto anterior antes de la nueva.
 * - contentFit en vez de resizeMode (nombre que usa expo-image), con los
 *   mismos valores de siempre ("cover", "contain", etc.).
 * Si no hay URL (uri vacío/null/undefined), no pinta nada — igual que antes
 * hacían las pantallas que envolvían su <Image> en `{p.imageUrl ? ... : ...}`.
 *
 * Conectado con: app/catalogo.tsx, app/producto/[id].tsx,
 * app/(tabs)/index.tsx, app/servicios.tsx, app/admin/categories.tsx,
 * app/admin/services.tsx, components/ImageLightbox.tsx,
 * components/Resenas.tsx — cualquier sitio que antes usaba <Image> de
 * "react-native" para pintar una foto remota (uri) ahora usa <SmartImage>.
 */
import React from "react";
import { Image, type ImageContentFit, type ImageStyle } from "expo-image";
import type { StyleProp } from "react-native";

export type SmartImageProps = {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  /** Duración del fundido de entrada, en ms. */
  transitionMs?: number;
  accessibilityLabel?: string;
};

export default function SmartImage({
  uri,
  style,
  contentFit = "cover",
  transitionMs = 250,
  accessibilityLabel,
}: SmartImageProps) {
  if (!uri) return null;

  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      transition={transitionMs}
      recyclingKey={uri}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
