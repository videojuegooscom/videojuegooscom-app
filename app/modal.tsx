/**
 * Archivo: app/modal.tsx
 * Función: pantalla modal de ejemplo de la plantilla de Expo Router, en la dirección /modal.
 * Para qué sirve: no se usa en la tienda; es la plantilla por defecto que quedó registrada.
 * Conectado con: components/themed-view.tsx y components/themed-text.tsx; no llama a Supabase ni a api/.
 * Utilizado por: solo app/_layout.tsx (la registra como Stack.Screen "modal"); ningún botón ni enlace la abre.
 * Dependencias: expo-router, react-native.
 * Estado: CANDIDATO_A_ELIMINAR (plantilla de Expo que nadie abre ni enlaza; solo está registrada en app/_layout.tsx)
 */
/**
 * Notas:
 * Qué hace: pantalla modal de ejemplo (plantilla por defecto de Expo
 * Router), registrada como ruta "modal" con presentation:"modal" en
 * app/_layout.tsx. De momento no se abre desde ningún botón de la app.
 *
 * Cómo funciona: usa ThemedView/ThemedText, que adaptan sus colores según
 * el esquema de color del dispositivo (ver hooks/use-color-scheme.ts), y ya
 * está centrada por diseño (alignItems/justifyContent: "center").
 *
 * Conectado con:
 * - components/themed-view.tsx, components/themed-text.tsx → contenedor y
 *   texto que siguen el tema claro/oscuro del sistema.
 * - app/_layout.tsx → registra esta pantalla como Stack.Screen "modal".
 */
import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function ModalScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">This is a modal</ThemedText>
      <Link href="/" dismissTo style={styles.link}>
        <ThemedText type="link">Go to home screen</ThemedText>
      </Link>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});
