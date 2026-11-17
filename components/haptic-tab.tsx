/**
 * Archivo: components/haptic-tab.tsx
 * Función: componente de botón de pestaña con vibración (plantilla de Expo).
 * Para qué sirve: envuelve el botón de la barra de pestañas y añade un toque háptico en iOS; no está enganchado a la barra de la tienda.
 * Conectado con: ningún archivo del proyecto.
 * Utilizado por: ningún archivo (comprobado con grep en app, components, lib y hooks).
 * Dependencias: @react-navigation/bottom-tabs, @react-navigation/elements, expo-haptics.
 * Estado: CANDIDATO_A_ELIMINAR (ningún archivo lo importa; resto de la plantilla de Expo).
 */
/**
 * Notas:
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
