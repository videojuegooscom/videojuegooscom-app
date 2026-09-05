/**
 * Qué hace: versión web del hook useColorScheme. Detecta si el sistema
 * está en modo claro u oscuro, pero evitando el "parpadeo" típico de web
 * cuando el renderizado estático no coincide con el cliente.
 *
 * Cómo funciona: en el primer render (antes de hidratar) siempre devuelve
 * "light"; una vez montado el componente en el cliente (hasHydrated=true),
 * devuelve el valor real del sistema.
 *
 * Conectado con:
 * - hooks/use-color-scheme.ts → misma interfaz, pero para nativo
 *   (iOS/Android), sin este ajuste de hidratación.
 * - hooks/use-theme-color.ts → lo usa para saber si aplicar colores claros
 *   u oscuros.
 */
import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
