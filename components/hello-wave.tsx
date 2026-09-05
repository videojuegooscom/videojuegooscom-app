/**
 * Qué hace: emoji de mano saludando (👋) con una pequeña animación de
 * balanceo. Viene de la plantilla base de Expo.
 *
 * Cómo funciona: usa react-native-reanimated para repetir 4 veces una
 * rotación de 25 grados a mitad de la animación.
 *
 * Conectado con: de momento no se usa en ninguna pantalla de app/; queda
 * disponible como componente decorativo suelto.
 */
import Animated from 'react-native-reanimated';

export function HelloWave() {
  return (
    <Animated.Text
      style={{
        fontSize: 28,
        lineHeight: 32,
        marginTop: -6,
        animationName: {
          '50%': { transform: [{ rotate: '25deg' }] },
        },
        animationIterationCount: 4,
        animationDuration: '300ms',
      }}>
      👋
    </Animated.Text>
  );
}
