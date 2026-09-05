/**
 * Qué hace: componente <Text> que adapta su color automáticamente al tema
 * claro/oscuro del sistema, con variantes de estilo predefinidas (title,
 * subtitle, link, defaultSemiBold). Viene de la plantilla base de Expo.
 *
 * Cómo funciona: usa el hook useThemeColor() para resolver el color según
 * el esquema de color activo (o lightColor/darkColor si se pasan). Las
 * pantallas principales de la app (tabs, admin) NO usan este componente:
 * definen su propia paleta COLORS de tema claro directamente.
 *
 * Conectado con:
 * - hooks/use-theme-color.ts → de donde saca el color.
 * - app/modal.tsx, components/ui/collapsible.tsx → pantallas/componentes
 *   que sí lo usan.
 */
import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    color: '#1EA7E8',
  },
});
