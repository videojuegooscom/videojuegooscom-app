/**
 * Qué hace: botón de barra de pestañas con vibración táctil suave (haptic
 * feedback) al pulsarlo, solo en iOS. Viene de la plantilla base de Expo.
 *
 * Cómo funciona: envuelve PlatformPressable y añade Haptics.impactAsync()
 * en onPressIn cuando la plataforma es iOS; en Android/web se comporta como
 * un botón normal.
 *
 * Conectado con: de momento no está enganchado en app/(tabs)/_layout.tsx
 * (esa pantalla usa la tab bar por defecto de expo-router); queda
 * disponible para usarlo ahí como tabBarButton si se quiere el efecto táctil.
 */
import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';

export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
