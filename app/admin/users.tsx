/**
 * app/admin/users.tsx
 * Qué hace: ruta /admin/users (Usuarios y participación). La pantalla vive en components/panel/users.tsx y se descarga
 * solo al abrirla (carga más rápida, paso 1, 2026-11-21): los clientes no la descargan nunca con la tienda.
 * Conectado con: components/panel/users.tsx y components/panel/PantallaDiferida.tsx.
 */
import { pantallaDiferida } from "../../components/panel/PantallaDiferida";

export default pantallaDiferida(() => import("../../components/panel/users"));
