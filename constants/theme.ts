/**
 * Qué hace: define la paleta de colores (Colors.light / Colors.dark) y las
 * familias tipográficas (Fonts) usadas por los componentes "Themed*"
 * (ThemedText, ThemedView) que vienen de la plantilla base de Expo.
 *
 * Cómo funciona: tintColorLight ya está alineado con el azul de acento de
 * la app ("#1EA7E8"). Ojo: las pantallas principales (tabs, admin) NO usan
 * este archivo — definen su propia paleta COLORS de tema claro directamente
 * en cada fichero, así que este Colors.light/dark solo afecta a los
 * componentes ThemedText/ThemedView (por ejemplo en app/modal.tsx).
 *
 * Conectado con:
 * - hooks/use-theme-color.ts → lee Colors[theme][colorName].
 * - components/themed-text.tsx, components/themed-view.tsx,
 *   components/ui/collapsible.tsx → usan estos colores indirectamente.
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
