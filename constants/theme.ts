/**
 * Qué hace: define la paleta de colores (Colors.light / Colors.dark) y las
 * familias tipográficas (Fonts) usadas por los componentes "Themed*"
 * (ThemedText, ThemedView) que vienen de la plantilla base de Expo.
 *
 * Cómo funciona: tintColorLight ya está alineado con el azul de acento de
 * la app ("#1EA7E8"). Ojo: las pantallas principales (tabs, admin) NO usan
 * Colors.light/dark — tienen su paleta COLORS de tema claro en cada fichero
 * (que va tomando sus valores de COLORES_TEXTO, ver abajo), así que
 * Colors.light/dark solo afecta a los componentes ThemedText/ThemedView
 * (por ejemplo en app/modal.tsx).
 *
 * Tamaños y colores comunes (auditoría móvil del 2026-11-12 y lección
 * «Tamaños comunes en el móvil y azul oscuro solo en la letra pequeña» del
 * Centro de Aprendizajes). Las pantallas los importan de aquí en vez de
 * escribir números a mano; se van pasando por grupos (grupo 1: barra
 * inferior, perfil/Mis seguimientos y los campos que hacían zoom).
 * - TAMANOS (letra, px): legal 12 SOLO para avisos legales y etiquetas
 *   cortas (estados de una línea de pasos, «© …»); minimo 13 para cualquier
 *   otro texto; cuerpo 15 para párrafos; destacado 17 para precios y datos
 *   que mandan; titulo3/titulo2/titulo1 20/24/28 para títulos.
 * - TACTIL: todo lo que se toca mide 44 px como mínimo (alto y ancho, con
 *   minHeight o hitSlop) y deja 8 px con lo que tiene al lado.
 * - CAMPO: letra 16 (con menos, Safari del iPhone hace zoom al escribir) y
 *   48 px de alto.
 * - COLORES_TEXTO: texto #0B2138; secundario rgba(11,33,56,0.72) es el gris
 *   MÁS CLARO permitido para texto; azulMarca #1EA7E8 y azulTexto #0A78B4.
 *   Regla del azul (dueño, 2026-11-12, opción B): el azul de marca
 *   #1EA7E8 NO cambia en botones, iconos, logo, fondos, títulos ni en el
 *   texto azul de 17 px o más; SOLO el TEXTO azul de menos de 17 px (enlaces,
 *   precios pequeños, categorías, contadores) usa azulTexto #0A78B4, que
 *   sobre blanco da 4,8:1 (el de marca, 2,7:1). Usa colorTextoAzul(tamaño)
 *   si el tamaño cambia según la pantalla.
 *
 * Conectado con:
 * - hooks/use-theme-color.ts → lee Colors[theme][colorName].
 * - components/themed-text.tsx, components/themed-view.tsx,
 *   components/ui/collapsible.tsx → usan estos colores indirectamente.
 * - app/(tabs)/_layout.tsx, app/(tabs)/perfil.tsx, app/servicios.tsx,
 *   components/PerfilPublico.tsx, components/Campanita.tsx → usan TAMANOS,
 *   TACTIL, CAMPO y COLORES_TEXTO.
 * - Grupo 2 (2026-11-12): app/(tabs)/chat-global.tsx (Foro),
 *   components/VenderAhoraModal.tsx, components/ContratarServicioModal.tsx,
 *   components/SellRequestMedia.tsx y app/admin/analytics.tsx (campos de
 *   fecha y chips) → también los usan.
 * - pruebas/perfil-datos.mjs → comprueba la barra inferior, la línea de
 *   estados, las pestañas del perfil y los campos a 16 px (sección TM) y el
 *   Foro y los formularios de Contratar y Vender (sección TM2).
 */

/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#1EA7E8';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

// Letra (px). Ver la cabecera: 12 solo legal/etiquetas, 13 mínimo para lo demás.
export const TAMANOS = {
  legal: 12,
  minimo: 13,
  cuerpo: 15,
  destacado: 17,
  titulo3: 20,
  titulo2: 24,
  titulo1: 28,
} as const;

// Zonas táctiles: 44 px de lado como mínimo y 8 px de separación.
export const TACTIL = {
  minimo: 44,
  separacion: 8,
} as const;

// Campos de texto: 16 px de letra (sin zoom en iPhone) y 48 px de alto.
export const CAMPO = {
  letra: 16,
  alto: 48,
} as const;

// Colores de texto. azulTexto solo para TEXTO azul de menos de 17 px (regla del azul, cabecera).
export const COLORES_TEXTO = {
  texto: '#0B2138',
  secundario: 'rgba(11,33,56,0.72)',
  azulMarca: '#1EA7E8',
  azulTexto: '#0A78B4',
} as const;

// Color de un texto azul según su tamaño: menos de 17 px → azulTexto; 17 o más → azul de marca.
export function colorTextoAzul(tamano: number): string {
  return tamano < TAMANOS.destacado ? COLORES_TEXTO.azulTexto : COLORES_TEXTO.azulMarca;
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
