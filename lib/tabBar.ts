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
// Altura de la barra (antes 64): el espacio de los botones = altura − margen de arriba (4) −
// margen de abajo. Con 64 − 4 − 10 = 50 px no cabían el icono (22) y el nombre (13): el nombre
// se encogía a 9 px y se recortaba por abajo («Inicio», «Perfil»…). Medido con el navegador
// de pruebas. Ahora los botones tienen 62 px y quedan holgados.
export const TAB_BAR_BASE_HEIGHT = 80;
/** Margen inferior de la barra sin la zona segura (también separa de la barra del navegador). */
export const TAB_BAR_BASE_PADDING_BOTTOM = 14;

/** Píxeles extra que ocupa la zona segura inferior en la web (0 en nativo o sin zona segura). */
export function useTabBarBottomInset(): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === "web" ? Math.max(0, Math.round(insets.bottom)) : 0;
}
