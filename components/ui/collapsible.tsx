/**
 * Archivo: components/ui/collapsible.tsx
 * Función: componente de bloque plegable (plantilla de Expo).
 * Para qué sirve: sección que se despliega al pulsar su título, con flecha que rota; no se usa en la tienda.
 * Conectado con: components/themed-text.tsx, components/themed-view.tsx, components/ui/icon-symbol.tsx, constants/theme.ts (Colors), hooks/use-color-scheme.ts.
 * Utilizado por: ningún archivo (comprobado con grep en app, components, lib y hooks).
 * Dependencias: react, react-native.
 * Estado: CANDIDATO_A_ELIMINAR (ningún archivo lo importa; resto de la plantilla de Expo).
 */
/**
 * Notas:
 * Qué hace: bloque de contenido plegable/desplegable con una flecha que
 * rota al abrir. Viene de la plantilla base de Expo.
 *
 * Cómo funciona: guarda isOpen en estado local y muestra/oculta children
 * dentro de una ThemedView al pulsar el título; el icono usa los colores
 * de constants/theme.ts según el tema claro/oscuro.
 *
 * Conectado con: de momento no se usa en ninguna pantalla de app/; queda
 * disponible como componente reutilizable para secciones tipo FAQ o "ver más".
 */
import { PropsWithChildren, useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useColorScheme() ?? 'light';

  return (
    <ThemedView>
      <TouchableOpacity
        style={styles.heading}
        onPress={() => setIsOpen((value) => !value)}
        activeOpacity={0.8}>
        <IconSymbol
          name="chevron.right"
          size={18}
          weight="medium"
          color={theme === 'light' ? Colors.light.icon : Colors.dark.icon}
          style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}
        />

        <ThemedText type="defaultSemiBold">{title}</ThemedText>
      </TouchableOpacity>
      {isOpen && <ThemedView style={styles.content}>{children}</ThemedView>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  content: {
    marginTop: 6,
    marginLeft: 24,
  },
});
