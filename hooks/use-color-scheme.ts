/**
 * Archivo: hooks/use-color-scheme.ts
 * Función: hook de tema claro/oscuro, versión nativa (plantilla de Expo).
 * Para qué sirve: reexporta useColorScheme de React Native; en web se usa use-color-scheme.web.ts.
 * Conectado con: hooks/use-color-scheme.web.ts (misma interfaz) y hooks/use-theme-color.ts.
 * Utilizado por: hooks/use-theme-color.ts, components/parallax-scroll-view.tsx y components/ui/collapsible.tsx (todos candidatos).
 * Dependencias: react-native.
 * Estado: CANDIDATO_A_ELIMINAR (solo lo usan otros archivos candidatos de la plantilla de Expo).
 */
/**
 * Notas:
 * Qué hace: reexporta el hook useColorScheme de React Native (detecta si el
 * sistema operativo está en modo claro u oscuro). Se usa en nativo
 * (iOS/Android); en web se usa la versión de use-color-scheme.web.ts.
 *
 * Cómo funciona: Expo/Metro elige automáticamente este archivo en nativo y
 * use-color-scheme.web.ts en web, gracias a la extensión ".web.ts".
 *
 * Conectado con:
 * - hooks/use-color-scheme.web.ts → misma interfaz, pero para web.
 * - hooks/use-theme-color.ts → lo usa para saber si aplicar colores claros
 *   u oscuros.
 */
export { useColorScheme } from 'react-native';
