/**
 * Qué hace: resuelve qué color usar para un componente "Themed*"
 * (ThemedText, ThemedView), según el tema claro/oscuro del sistema.
 *
 * Cómo funciona: si el componente recibe un color explícito por prop
 * (lightColor/darkColor) lo usa; si no, cae en Colors[theme][colorName] de
 * constants/theme.ts. Solo lo usan los componentes ThemedText/ThemedView;
 * las pantallas principales de la app (tabs, admin) no pasan por aquí.
 *
 * Conectado con:
 * - constants/theme.ts → de donde saca los colores por defecto.
 * - hooks/use-color-scheme.ts (o su variante .web.ts) → de donde saca el
 *   tema activo.
 * - components/themed-text.tsx, components/themed-view.tsx → lo usan.
 *
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const theme = useColorScheme() ?? 'light';
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}
