/**
 * Medidas compartidas de la barra de pestañas inferior (Inicio, Perfil, Cesta, Foro, Blue IA).
 *
 * En la web del iPhone (Safari con la barra del navegador recogida o la web añadida a la
 * pantalla de inicio) la página llega hasta el borde inferior, debajo de la barra de inicio
 * del sistema. Con `viewport-fit=cover` (app/+html.tsx) el navegador informa de esa zona
 * segura y aquí se suma a la barra de pestañas, para que los nombres de las secciones no se
 * corten. Lo usan también los elementos que se colocan justo encima de la barra (buscador
 * flotante y botón "volver arriba" de la portada, aviso de cookies).
 *
 * En nativo no se toca: la app se publica solo como web y allí se mantienen los valores fijos.
 */
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Altura de la barra sin la zona segura (antes era la altura total). */
export const TAB_BAR_BASE_HEIGHT = Platform.OS === "ios" ? 68 : 64;
/** Margen inferior de la barra sin la zona segura. */
export const TAB_BAR_BASE_PADDING_BOTTOM = Platform.OS === "ios" ? 16 : 10;

/** Píxeles extra que ocupa la zona segura inferior en la web (0 en nativo o sin zona segura). */
export function useTabBarBottomInset(): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === "web" ? Math.max(0, Math.round(insets.bottom)) : 0;
}
