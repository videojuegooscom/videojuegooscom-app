/**
 * app/admin/google.tsx
 * Qué hace: ruta /admin/google («Google»: cómo te encuentran en Google, con los datos de Search Console). La pantalla
 * vive en components/panel/google.tsx y se descarga solo al abrirla, como el resto del panel.
 * Conectado con: components/panel/google.tsx y components/panel/PantallaDiferida.tsx.
 */
import { pantallaDiferida } from "../../components/panel/PantallaDiferida";

export default pantallaDiferida(() => import("../../components/panel/google"));
