/**
 * app/admin/envios.tsx
 * Qué hace: ruta /admin/envios (Tarifas de envío). La pantalla vive en components/panel/envios.tsx y se descarga solo al
 * abrirla (carga más rápida, paso 1, 2026-11-21): los clientes no la descargan nunca con la tienda.
 * Conectado con: components/panel/envios.tsx y components/panel/PantallaDiferida.tsx.
 */
import { pantallaDiferida } from "../../components/panel/PantallaDiferida";

export default pantallaDiferida(() => import("../../components/panel/envios"));
