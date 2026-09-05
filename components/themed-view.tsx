/**
 * Qué hace: componente <View> que adapta su color de fondo automáticamente
 * al tema claro/oscuro del sistema. Viene de la plantilla base de Expo.
 *
 * Cómo funciona: usa el hook useThemeColor() para resolver el
 * backgroundColor según el esquema de color activo (o lightColor/darkColor
 * si se pasan). Las pantallas principales de la app (tabs, admin) NO usan
 * este componente: definen su propio fondo con la paleta COLORS del tema
 * claro directamente.
 *
 * Conectado con:
 * - hooks/use-theme-color.ts → de donde saca el color.
 * - app/modal.tsx, components/parallax-scroll-view.tsx,
 *   components/ui/collapsible.tsx → pantallas/componentes que sí lo usan.
 */
import { View, type ViewProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export function ThemedView({ style, lightColor, darkColor, ...otherProps }: ThemedViewProps) {
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
