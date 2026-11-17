/**
 * Archivo: components/ui/icon-symbol.ios.tsx
 * Función: componente de icono multiplataforma, versión iOS (plantilla de Expo).
 * Para qué sirve: dibuja iconos SF Symbols nativos de Apple; Expo lo elige solo en iOS en lugar de icon-symbol.tsx.
 * Conectado con: components/ui/icon-symbol.tsx (misma interfaz).
 * Utilizado por: solo components/ui/collapsible.tsx, a través de icon-symbol (candidato).
 * Dependencias: expo-symbols, react-native.
 * Estado: CANDIDATO_A_ELIMINAR (solo lo usa collapsible.tsx, que tampoco lo usa nadie).
 */
/**
 * Notas:
 * Qué hace: versión para iOS del componente de icono IconSymbol. Dibuja
 * iconos SF Symbols nativos de Apple.
 *
 * Cómo funciona: envuelve SymbolView de expo-symbols; en iOS, Expo Router
 * elige automáticamente este archivo en vez de icon-symbol.tsx gracias a
 * la extensión ".ios.tsx".
 *
 * Conectado con: components/ui/icon-symbol.tsx → misma interfaz, pero para
 * Android/web (usa Material Icons en vez de SF Symbols).
 */
import { SymbolView, SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { StyleProp, ViewStyle } from 'react-native';

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = 'regular',
}: {
  name: SymbolViewProps['name'];
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <SymbolView
      weight={weight}
      tintColor={color}
      resizeMode="scaleAspectFit"
      name={name}
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}
