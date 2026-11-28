/**
 * Archivo: components/AsistenteBlue.tsx
 * Función: componente de Blue, la asistente flotante de la tienda (antes una campanita).
 * Para qué sirve: muestra a Blue (avisos, guía de bienvenida y mini-guías, panel de asistente, noticias, valoraciones de pedidos y chat con el equipo) en Inicio, fichas y panel; se monta una sola vez en app/_layout.tsx.
 * Conectado con: lib/supabase.ts, lib/analiticaPropia.ts, lib/interaccion.ts, lib/conocimiento.ts, lib/notificaciones.ts, lib/envio.ts, lib/admin/productos.utilidades.ts, components/marca/MarcaAnimada.tsx, BarraBusqueda.tsx, TirarParaActualizar.tsx, PerfilPublico.tsx, VisorFotos.tsx, VentanaValoracion.tsx, CarruselProductosCategoria.tsx, constants/temaTienda.ts, api/blue-ia.ts y sus partes en components/blue/ (DatosBlue, AyudasBlue, PiezasBlue, PasosGuia y GuiaBlue, separadas en la tanda 6 de «ordenar el proyecto», 2026-11-18, sin cambiar nada).
 * Utilizado por: app/_layout.tsx (montaje) y otras pantallas que lo mencionan o lo escuchan (por ejemplo catálogo, ficha de producto, Blue IA y panel).
 * Dependencias: react, react-native, @expo/vector-icons, expo-router, @react-native-async-storage/async-storage.
 * Estado: ACTIVO
 *
 * Notas: cabecera original conservada justo debajo.
 */
/**
 * Notas:
 * "Blue", la asistente flotante de ventas
 *
 * Qué hace: antes era una campanita; ahora es Blue, el capibara asistente de la
 * tienda (se monta una sola vez en app/_layout.tsx, fuera del Stack, así que no se
 * reinicia al navegar).
 * - Avisos de pedidos: nombran el pedido por su referencia («Tu pedido VZ-XXXX-XXXX está enviado»), nunca por su número
 *   interno (dueño, 2026-11-11).
 * - SOLO sale en Inicio, en las fichas de producto y de servicio y, para el dueño, en el panel (pantallaConBlue;
 *   dueño, 2026-11-04). En el resto de pantallas no se ve ni dice nada; la guía, si está abierta, sigue pasando por ellas.
 * - FIJO arriba a la derecha, donde no estorba (posicionFija): en las fichas, dentro de la cabecera, a la altura de la
 *   flecha de volver; en Inicio, justo debajo del buscador (en el móvil, si ahí está Instagram junto al logo, justo
 *   debajo de Instagram). Mide 52 px. Ya no se arrastra ni se aparta: si al desplazar la página queda un botón debajo de
 *   su sitio, se esconde hasta que quede libre (algoDebajoDeBlue). Se mueve sola (components/marca/MarcaAnimada.tsx).
 * - Guía de bienvenida (GuiaBlue): a los 15 s, una vez por dispositivo, solo sin
 *   sesión y solo si está en Inicio (en una ficha, el catálogo, un chat… espera a que
 *   llegue a Inicio, sin interrumpirle). 17 pasos (18 si se puede instalar la tienda), con más imagen que letra: una mano
 *   enseña dónde tocar y la guía hace las cosas (cambiar de sección desde la tarjeta, pulsar
 *   «Vender ahora» y abrir el formulario, desplazarlo y salir con la flecha, escribir ejemplos
 *   en el buscador con letras Siri, enmarcar las pestañas de Perfil). SEÑALA cada botón (se
 *   oscurece todo menos él, aro azul que late y flecha) con data-testid "pestana-*" en
 *   app/(tabs)/_layout.tsx, id "buscador-flotante" en components/BarraBusqueda.tsx y los
 *   nativeID "vender-scroll", "perfil-pestanas" y "perfil-acceso". Va a Inicio al empezar y
 *   se usa con un dedo: la tarjeta mide siempre lo mismo y «Siguiente» queda siempre a la
 *   altura del pulgar derecho (lo señalado se desplaza hacia arriba para no quedar tapado).
 *   Al final ayuda a crear cuenta o a iniciar sesión (/perfil?acceso=registro|entrar).
 *   Se puede repetir desde el panel de Blue. Se prueba entera con pruebas/guia-blue.mjs.
 *   AL DÍA (dueño, 2026-11-13, «guía completa»): con sesión, Perfil enseña también «Mis pedidos» (los filtros Todos / En curso /
 *   Completados / Cancelados / Facturas), «Tus facturas» (acción «Ver mis facturas» → /perfil?tab=seguimientos&filtro=facturas,
 *   plazo 24 h con tarjeta y 24-48 h en efectivo, la regla de api/blue-ia.ts) y «Me gusta»; Servicios añade «Reparación por
 *   envío» SOLO si reparacion_envio_ajustes.activo (lib/envio.ts; si no, no se menciona); en la Cesta, con artículos, se señala
 *   «Ir a pagar» (nativeID cesta-pagar) y «Cómo se compra» nombra solo las formas de pago que ofrece GET /api/pago (tarjeta,
 *   Bizum, Klarna), como el checkout. La letra de la guía es de 13 px como mínimo (TAMANOS.minimo) y, en los pasos que se
 *   desplazan (la ficha), la tarjeta no se coloca hasta que el recuadro se ha asentado (dos fotogramas sin cambio).
 *   MINI-GUÍAS: el panel de Blue (pestaña Asistente) tiene una fila «Guías rápidas» con Inicio, Catálogo,
 *   Artículo, Vender, Perfil, Cesta, Foro, Blue IA y Servicios (la de la pantalla actual, resaltada): la
 *   misma guía, pero solo con los pasos de ESA pantalla (campo `seccion` de cada paso). Si es otra pantalla
 *   la guía lleva hasta allí y al terminar vuelve; no marca la guía de bienvenida como vista y se mide
 *   aparte (miniguia_*). Van en el panel porque Blue no se ve en Vender, el Foro ni Blue IA.
 *   Se prueba con pruebas/blue-panel.mjs.
 *   «Mejoras en la tienda» (fila del Asistente, solo en la tienda): cierra el panel y abre la cajita de ideas
 *   (MejorasModal de components/VentanaValoracion.tsx, origen «blue»).
 * - Aparece 10 s después de entrar en la web (APARECER_MS, contados desde que
 *   se abrió la página con performance.now()): antes no se ve ni se puede tocar.
 *   Entra con un rebote de escala, saluda moviéndose de lado a lado y enseña un
 *   mini bocadillo "¡Hola! Soy Blue" unos segundos (al tocarlo abre su panel).
 * - Scroll (solo web): al bajar se desliza hacia su borde y se desvanece; al
 *   subir vuelve. Escucha el scroll de CUALQUIER contenedor (listener en
 *   document con capture) y compara el scrollTop de ese mismo elemento con el
 *   anterior, con un umbral de 12 px para no parpadear; los carruseles
 *   horizontales (no cambian scrollTop) no cuentan. Cerca del principio
 *   (scrollTop < 40) siempre se ve. No se oculta con su panel abierto, con un
 *   bocadillo o con el saludo a la vista, y vuelve a verse al cambiar de pantalla.
 * - «Mi perfil» desplegado en Mi cuenta (/perfil; useMiPerfilAbierto de components/PerfilPublico.tsx): Blue no aparece
 *   (dueño, 2026-11-03), como con «Completa tu perfil». Desde 2026-11-04 Blue ya no sale en Mi cuenta (solo lo hace si
 *   la guía lo lleva allí).
 * - Visor de fotos (components/VisorFotos.tsx, foto ampliada de la ficha): mientras está abierto Blue se esconde
 *   del todo (dueño, 2026-10-31) y no dice nada: sus mensajes y su saludo esperan a que se cierre.
 * - Habla con bocadillos DEBAJO de ella (pegados a su borde derecho; al lado tapaban la cabecera de las fichas), en
 *   cristal transparente (se lee bien) y al tocarlos llevan a lo que dicen (solo cuando ya ha aparecido):
 *   · En la ficha de un producto, tras 8 s: un dato real del producto (si la
 *     descripción menciona la garantía, esa frase; si no, que es unidad única y se
 *     reserva 15 minutos en la cesta) y después cómo se entrega (en persona en
 *     Zaragoza o envío a toda España); al tocarlos se abre el chat de la tienda
 *     (Blue IA con el producto ya indicado; desde ahí, si hace falta, el equipo).
 *   · En Inicio, tras 12 s: una de las "Noticias Flash" activas
 *     (tabla flash_news, se editan en app/admin/flash-news.tsx).
 *   Cada bocadillo sale una sola vez por visita y se cierra con la X o solo, a los 12 s a la vista (MENSAJE_VISIBLE_MS,
 *   dueño 2026-11-04); el saludo «¡Hola! Soy Blue», a los 2,8 s (SALUDO_MS).
 *   TODOS los que Blue dice por su cuenta pasan por una cola (`decir`, petición del dueño 2026-10-30): el
 *   primero, como pronto a los 15 s de entrar en la pantalla (antes se deja leer lo que hay) y entre uno y
 *   el siguiente, al menos 15 s; al cambiar de pantalla la cola se vacía.
 * - NUNCA encima de la barra de búsqueda (dueño, 2026-11-01): en Inicio Blue va justo debajo de la barra flotante
 *   (#buscador-flotante), también mientras está escondida un momento por el scroll, y se esconde mientras la lista de
 *   resultados está abierta encima de su sitio. Se prueba con las secciones BU y BF de pruebas/perfil-datos.mjs y con
 *   pruebas/blue-regresion.mjs.
 * - Al tocar a Blue se abre su panel con 2 pestañas: "Asistente" (UN solo botón «Hablar con
 *   Blue IA o el equipo» —Blue IA responde primero y desde ese chat se pasa al equipo—, la guía,
 *   "Vender", instalar) y "Noticias y avisos" (antes eran dos pestañas, «Notificaciones» y «Noticias»:
 *   avisos —mensajes sin leer, favoritos que ya no están, novedades, con su número—, Noticias Flash y
 *   los ajustes de avisos, en filas con icono). Si hay avisos, abre en esa pestaña.
 * - Avisos de Noticias Gaming: si el cliente los activó (con sesión,
 *   preferencias_usuario.avisos_noticias; sin sesión o si esa tabla falla, la clave
 *   local NOTICIAS_AVISOS_KEY = "1"), cuenta las noticias publicadas desde la última
 *   vez que las vio (lo más reciente entre preferencias_usuario.noticias_vistas_hasta
 *   y NOTICIAS_VISTAS_KEY; si no hay ninguna, las de las últimas 24 h). Se suman al
 *   número rojo y salen en «Noticias y avisos» con el título de la más reciente («Noticia nueva: …»), que se abre
 *   directamente al tocar el aviso (/chat-global?noticia=<id>; dueño, 2026-11-04). Si no están activados,
 *   «Activa los avisos de noticias» los activa ahí mismo con un toque (activarAvisosNoticias; lo
 *   mismo que la campana de Noticias Gaming). En esa pestaña un apartado vacío no sale (ni
 *   «Estás al día» ni «No hay noticias ahora mismo»; dueño, 2026-11-04).
 * - Avisos de la tienda (en «Noticias y avisos», con sus ajustes en «Mis avisos»):
 *   · SOLO CON CUENTA (dueño, 2026-11-11, ventaja de registrarse): los avisos de artículos nuevos y de bajada de
 *     precio. Sin sesión no salen y en «Mis avisos», en vez del interruptor, va «Avisos de bajadas de precio y artículos
 *     nuevos · solo con cuenta» con «Crear cuenta gratis» (crearCuentaPorAvisos: evento «Blue: crear cuenta por
 *     avisos», marcarOrigenRegistro de lib/analiticaPropia.ts y vuelta a esta pantalla con VOLVER_TRAS_ACCESO_KEY).
 *     Administración → Analítica lo mide (#analitica-blue-avisos-cuenta). Se prueba con la sección AC de
 *     pruebas/perfil-datos.mjs.
 *   · Artículos nuevos: si el cliente lo activa (preferencias_usuario.avisos_novedades), cuenta los productos con
 *     products.novedad_en posterior a la última vez que los vio. Apagado por defecto. El ajuste antiguo del
 *     dispositivo (NOVEDADES_AVISOS_KEY) se pasa a la cuenta una vez al iniciar sesión.
 *   · «Avísame cuando llegue» (con sesión): el cliente apunta hasta 10 búsquedas
 *     (tabla avisos_busqueda; también desde el catálogo y desde el buscador de Inicio cuando una
 *     búsqueda no encuentra nada, con crearAvisoBusqueda) y Blue le avisa cuando entra un artículo
 *     con todas esas palabras.
 *   · «Avisarme cuando haya otro» (dueño, 2026-11-16; tabla avisos_reposicion, lib/interaccion.ts): tras un pedido
 *     cancelado porque el artículo ya no está disponible, el cliente lo enciende en Mis pedidos; cuando entra otro de la
 *     misma familia o modelo (encajaReposicion, con los sinónimos de la búsqueda) sale «Ya tenemos otro «Xbox Series S»:
 *     … · Ver» con los demás avisos; al tocarlo queda avisado (avisado_en) y se mide aviso_reposicion_tocado. Sale en la
 *     app sea cual sea el canal elegido (el correo aún no se manda).
 *   · Estado de tus pedidos y reparaciones (con sesión): si la tienda cambia la etapa de un pedido o de una
 *     reparación (tablas pedidos y service_requests, las mismas que enseña Perfil → Seguimientos) sale un
 *     aviso con icono, suma al número rojo y Blue lo dice una vez en un mensaje que lleva a Seguimientos. Se
 *     compara con la etapa que ya viste (guardada por cuenta en el móvil, SEG_VISTOS_PREFIJO) y desaparece al abrir
 *     Seguimientos (marcarSeguimientosVistos). La primera vez en un dispositivo no avisa de lo antiguo.
 *   · Reserva que vence: cada artículo de la cesta (CART_KEY, campo reservedUntil de lib/reservas.ts:
 *     15 minutos) sale como aviso con lo que le queda; con 5 minutos o menos suma al número rojo y
 *     Blue lo dice una vez en un mensaje que lleva a la cesta (no en la propia Cesta ni en el pedido).
 *   · Bajada de precio (con sesión): de lo que le gusta (LIKED_PRODUCTS_KEY y los «me gusta» de la cuenta,
 *     misMeGustaServidor de lib/interaccion.ts) o tiene en la cesta (CART_KEY) se guarda en el móvil el precio visto
 *     (PRECIOS_VISTOS_KEY); si baja, avisa.
 *     «Avísame si baja de precio» (mejora 5, 2026-11-14): lo que el cliente sigue desde la ficha (tabla avisos_precio,
 *     lib/interaccion.ts) se compara con el precio guardado al activarlo (o el último avisado); Blue lo dice en un mensaje
 *     («Ha bajado de precio: X, ahora N €», lleva a la ficha) UNA vez por bajada: queda en el dispositivo (DICHOS_KEY) y
 *     en la cuenta (precio_avisado). Se relee al abrir o volver a la tienda y al activar o quitar uno (sin sondeo nuevo).
 *   · Estado de pedidos (mejora 5): el mensaje de Blue dice «Tu pedido VZ-… está enviado · Ver seguimiento» UNA vez por
 *     cambio, también entre visitas (DICHOS_KEY). Se miden pedido_aviso_estado_mostrado / _tocado y aviso_precio_mostrado /
 *     _tocado (solo el estado o el producto, sin datos personales) en Administración → Analítica.
 *   · Valoración tras la entrega (mejora 11, 2026-11-15): a los 3 días o más del paso «entregado» (pedido_estados) de un
 *     pedido sin valorar (pedido_valoraciones), Blue dice UNA vez «¿Qué tal tu pedido VZ-…? Valóralo en 10 segundos»
 *     (lleva a Mis pedidos; queda dicho al enseñarse, DICHOS_KEY) y se mide valoracion_pedida (origen blue). Se mira en el
 *     mismo repaso de los seguimientos (sin sondeo nuevo) y solo si hay pedidos entregados aún sin resolver.
 * - Blue en momentos clave (mejora 12, 2026-11-15; ConsejoBlue): consejos UNA vez por dispositivo en los primeros momentos
 *   (primera vez en la cesta con artículos: la compra en 3 pasos con «Ir a pagar» y «Ahora no»; el catálogo; una ficha; el
 *   primer «Comparar»; tras crear la cuenta). Esperan su turno en la cola de «decir», nunca dos a la vez ni con la guía
 *   abierta, en su propia tarjeta (también donde Blue no se ve) que no tapa los botones de comprar ni la barra de comparar.
 *   «No volver a mostrar consejos» (en la tarjeta y en «Mis avisos») los apaga todos; los avisos de pedidos, precio y
 *   valoración siguen. Analítica: consejo_mostrado / _seguido / _cerrado y consejos_desactivados (#analitica-consejos).
 *   · Solo el admin: ventas de artículos de VeoAura que aún no se han podido confirmar a
 *     VeoAura (tabla escaparate_salida) → panel Escaparate.
 *   · Solo el admin: pedidos y reparaciones en curso sin ningún cambio desde hace 48 h (updated_at de pedidos y
 *     service_requests) → «N pedidos y M reparaciones llevan más de 48 h sin cambios» con «Revisar» (Pedidos o
 *     Servicios); Blue lo dice además una vez al día dentro de Administración (OLVIDADOS_DICHO_KEY).
 * - Dentro del Panel de control (/admin, solo el dueño) Blue solo habla de lo del panel (petición del dueño,
 *   2026-11-01): sus mensajes son los del panel (olvidados, propuestas de «Lo que Blue sabe»); el número rojo y la
 *   pestaña «Avisos del panel» solo cuentan y enseñan los clientes que han escrito, las ventas de VeoAura sin confirmar
 *   y los olvidados (avisosPanel), sin los avisos de la tienda, las noticias ni «Mis avisos»; y el Asistente ofrece
 *   «Ir al Panel de control», «Lo que Blue sabe» y «Volver a la tienda» (sin guías, «Vender» ni instalar).
 *
 * Rendimiento: el sondeo (45 s) de mensajes sin leer y de noticias nuevas se pausa
 * con la pestaña en segundo plano (web). El recuento de noticias es head (sin
 * filas). Las consultas del bocadillo son pequeñas y de una fila. Los cambios de sesión releen la cuenta, el chat y los
 * avisos al entrar, salir o cambiar la cuenta, nunca con cada renovación del token (TOKEN_REFRESHED; sesión estable,
 * 2026-11-14).
 *
 * Conectado con:
 * - app/_layout.tsx → la monta una sola vez.
 * - app/(tabs)/blue-ia.tsx → chat completo con Blue IA.
 * - sql/product_chats.sql → get_unread_chat_count().
 * - app/producto/[id].tsx → misma clave de "me gusta" (LIKED_PRODUCTS_KEY).
 * - app/(tabs)/chat-global.tsx → misma clave/versión de "Novedades vistas" y mismas
 *   claves de avisos de noticias (activar con la campana; marcar como vistas).
 * - supabase/migrations/20261013200000_noticias_comentarios_preferencias.sql →
 *   tabla preferencias_usuario (cada usuario lee la suya).
 * - app/vender.tsx → página "Vender" (botones de Blue, de su panel y de la guía).
 * - lib/interaccion.ts → «me gusta» de la cuenta (bajadas de precio); app/(tabs)/perfil.tsx → registro y vuelta
 *   (VOLVER_TRAS_ACCESO_KEY); app/admin/analytics.tsx → #analitica-blue-avisos-cuenta.
 * - constants/temaTienda.ts → CAMPO.letra (16 px) en los campos de texto, para que el iPhone no haga zoom, y
 *   COLORES_TEXTO.azulTexto en el «Blue · … Entendido ›» de la pista del Foro (texto azul de 13 px).
 */
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Animated, Dimensions, Easing, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useHojaAbajo } from "./DesplazamientoSuave";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { rolDeUsuario, supabase } from "../lib/supabase";
import { leerConsentimientoAnalitica, marcarOrigenRegistro, marcarOrigenVender, medirEvento, trasPrimeraPintura } from "../lib/analiticaPropia";
import { alCambiarAvisosPrecio, alCambiarAvisosReposicion, marcarBajadaAvisada, marcarReposicionAvisada, misAvisosPrecio, misMeGustaServidor, precioReferenciaAviso } from "../lib/interaccion";
import { guardarConocimiento, temasRespondidos, TEMAS_CONOCIMIENTO, type TemaConocimiento } from "../lib/conocimiento";
import { estadoNotificaciones, notificarMensajeNuevo } from "../lib/notificaciones";
import MarcaAnimada from "./marca/MarcaAnimada";
import { registrarAvisoLlegada } from "./BarraBusqueda";
import { alRecargar } from "./TirarParaActualizar";
import { useMiPerfilAbierto, usePerfilObligatorioVisible } from "./PerfilPublico";
import { suscribirVisorFotos, visorFotosAbierto } from "./VisorFotos";
import { VentanaMejoras, VALORACION_ESPERA_MS, cargarValoracionesPedidos, entregadoEnDe, tocaValorarPedido } from "./VentanaValoracion";
import { anadidosCompararDesdeArranque, useAlturaBarraComparar, useComparar } from "./CarruselProductosCategoria";
import { CAMPO } from "../constants/temaTienda";
import { alCambiarRegalosEnvio, cargarHistorialPedidos, cargarMisEnviosGratis, formatearEuros, textoRegaloEnvio, type RegaloEnvio } from "../lib/envio";
import { AvisoBusqueda, Bajada, CART_KEY, COLORS, CRISTAL, CUENTA_NUEVA_MS, DIA_MS, LIKED_PRODUCTS_KEY, Llegada, MomentoBlue, NOTICIAS_AVISOS_KEY, NOTICIAS_VISTAS_KEY, NOVEDADES_AVISOS_KEY, NOVEDADES_CONTENT_VERSION, NOVEDADES_SEEN_KEY, NOVEDADES_VISTAS_KEY, OLVIDADOS_DICHO_KEY, OLVIDO_MS, PRECIOS_VISTOS_KEY, PedidoSegDato, RELOJ_RESERVAS_MS, RELOJ_SEGUIMIENTOS_MS, RESERVA_AVISO_MS, ReparacionSegDato, ReservaAviso, SELECTOR_VISTO_KEY, SegAviso, TEXTO_CRISTAL, VOLVER_TRAS_ACCESO_KEY, VistosSeg, apuntarDicho, calcularSegAvisos, cambiarConsejos, cargarDichos, consultarPagoOnline, contenidoConsejo, crearAvisoBusqueda, firmaPedidoSeg, guardarVistosSeg, leerConsejosApagados, leerJsonLocal, leerVistosSeg, minutosQueQuedan, momentoEnPantalla, oyentesAvisos, oyentesSeguimientos, textoOlvidados, useConsejosApagados, valorarDesde, valorarResueltos } from "./blue/DatosBlue";
import { APARECER_MS, APARTARSE_CADA_MS, APARTARSE_TRAS_SCROLL_MS, BLUE_DOM_ID, BLUE_MENSAJE_DOM_ID, BLUE_SIZE, Bocadillo, DESLIZ_OCULTO, EDGE_INSET, ENTRE_MENSAJES_MS, GUIA_MS, GUIA_VISTA_KEY, MENSAJE_TRAS_ENTRAR_MS, MENSAJE_VISIBLE_MS, NOTICIA_ESPERA_MS, PARADA_MS, POLL_MS, PRODUCTO_ESPERA_MS, PROP_HUECO_MS, PROP_MAX_DIA, SALUDO_MS, SCROLL_ARRIBA, SCROLL_UMBRAL, SEGUNDO_MENSAJE_MS, SITIO_FIJO, Sitio, USA_NATIVO, algoDebajoDeBlue, contarBlueAbierto, contarMensaje, destinoDeAviso, getLikedProductIds, guardarEstadoProp, isoAMs, leerEstadoProp, llegadasReposicion, mensajeProducto, pantallaConBlue, posicionFija, yaDicho } from "./blue/AyudasBlue";
import { Aviso, AvisoSelector, BotonPanel, ConsejoBlue, FilaBlue, IconoCirculoBlue, TituloSeccionBlue } from "./blue/PiezasBlue";
import { FONDO_GUIA, NOMBRE_SECCION_GUIA, SeccionGuia, seccionDeGuia } from "./blue/PasosGuia";
import { GuiaBlue } from "./blue/GuiaBlue";
export { crearAvisoBusqueda, firmaPedidoSeg, marcarSeguimientosVistos } from "./blue/DatosBlue";
// Sin la migración de la reparación por envío no existe entrega_modo: se pregunta una vez y se recuerda (sin repetir el 400).
let sinEntregaModo = false;
// El buscador de Inicio (components/BarraBusqueda.tsx) lo ofrece cuando no encuentra nada.
registrarAvisoLlegada(crearAvisoBusqueda);

// --- Instalar la tienda como app (solo web) ----------------------------------------------
// Chrome/Android avisa con «beforeinstallprompt»: se guarda el evento y Blue ofrece un botón
// que abre el diálogo de instalación. En iPhone/iPad (Safari) no existe ese diálogo: Blue
// enseña los pasos de «Añadir a pantalla de inicio». Si ya está instalada, no se ofrece.
type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let eventoInstalar: EventoInstalar | null = null;
const oyentesInstalar = new Set<() => void>();
const INSTALAR_KEY = "videojuegoszaragoza:blue_instalar_visto";
const INSTALAR_ESPERA_MS = 7 * 24 * 60 * 60 * 1000;

function esWebConVentana(): boolean {
  return Platform.OS === "web" && typeof window !== "undefined";
}
function appYaInstalada(): boolean {
  if (!esWebConVentana()) return false;
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}
function esAppleMovil(): boolean {
  if (!esWebConVentana()) return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}
// "prompt" = diálogo propio del navegador; "ios" = pasos manuales; null = no se ofrece.
function modoInstalar(): "prompt" | "ios" | null {
  if (!esWebConVentana() || appYaInstalada()) return null;
  if (eventoInstalar) return "prompt";
  return esAppleMovil() ? "ios" : null;
}
if (esWebConVentana()) {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    eventoInstalar = e as EventoInstalar;
    oyentesInstalar.forEach((f) => f());
  });
  window.addEventListener("appinstalled", () => {
    eventoInstalar = null;
    medirEvento("app_instalada", "App instalada");
    oyentesInstalar.forEach((f) => f());
  });
}

export default function AsistenteBlue() {
  const pathname = usePathname() ?? "";
  const enAdmin = pathname.startsWith("/admin");
  // En las pantallas de chat (y en el propio chat de Blue IA) no se muestra: taparía
  // el campo de escribir y el botón de enviar.
  const enChat =
    pathname.startsWith("/blue-ia") ||
    pathname.startsWith("/chat-global") ||
    pathname.startsWith("/chat/") ||
    // La página de venta es un formulario largo: Blue taparía los campos y el botón de enviar.
    pathname.startsWith("/vender");
  // Blue solo sale en Inicio, en las fichas de producto y de servicio y en el panel (dueño, 2026-11-04). En el resto
  // de pantallas no se ve (como en los chats); la guía, si está abierta, sigue pasando por ellas.
  const sinBlue = enChat || !pantallaConBlue(pathname);

  const [ready, setReady] = useState(false);
  // Siempre fijo arriba a la derecha (dueño, 2026-11-04).
  const sitioRef = useRef<Sitio>(SITIO_FIJO);
  const [sitio, setSitio] = useState<Sitio>(SITIO_FIJO);
  const posRef = useRef({ x: 0, y: 0 });
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const [panelOpen, setPanelOpen] = useState(false);
  const animPanel = useHojaAbajo(panelOpen);
  const panelOpenRef = useRef(false);
  panelOpenRef.current = panelOpen;
  // «Mejoras en la tienda»: la cajita de ideas que se abre desde el Asistente.
  const [mejorasAbierta, setMejorasAbierta] = useState(false);
  // «Vender» es una página (app/vender.tsx), no una ventana emergente.
  const abrirVender = useCallback(() => router.push("/vender" as Href), []);
  // Guía de bienvenida (GuiaBlue, al final de este archivo).
  const [guiaAbierta, setGuiaAbierta] = useState(false);
  const guiaAbiertaRef = useRef(false);
  guiaAbiertaRef.current = guiaAbierta;
  // Mini-guía («Guía rápida» del panel): solo los pasos de la pantalla donde está la persona, sin salir de ella. null = guía completa.
  const [guiaMini, setGuiaMini] = useState<{ seccion: SeccionGuia; ruta?: string } | null>(null);
  const guiaMiniRef = useRef<{ seccion: SeccionGuia; ruta?: string } | null>(null);
  guiaMiniRef.current = guiaMini;
  const guiaPendienteRef = useRef(false);
  // Pantalla donde estaba la persona al abrirse la guía: al saltarla o cerrarla se vuelve allí (la guía te lleva por
  // otras pantallas y, sin esto, te dejaba en la última).
  const guiaOrigenRef = useRef<string | null>(null);
  const pathnameActualRef = useRef(pathname);
  pathnameActualRef.current = pathname;
  // (Si ya hay una guía abierta no se abre otra: p. ej. la de bienvenida, a los 15 s, no pisa una mini-guía.)
  const abrirGuia = useCallback(() => {
    if (guiaAbiertaRef.current) return;
    guiaOrigenRef.current = pathnameActualRef.current;
    setGuiaMini(null);
    setGuiaAbierta(true);
  }, []);
  // Si la mini-guía es de la pantalla donde está la persona, no se mueve de ella (`ruta`); si es de otra, la guía la lleva
  // hasta allí (cada paso sabe su pantalla) y al terminar vuelve a donde estaba.
  const abrirMiniGuia = useCallback((seccion: SeccionGuia) => {
    if (guiaAbiertaRef.current) return;
    const aqui = pathnameActualRef.current;
    guiaOrigenRef.current = aqui;
    setGuiaMini({ seccion, ruta: seccionDeGuia(aqui) === seccion ? aqui : undefined });
    setGuiaAbierta(true);
  }, []);
  // Durante la guía Blue se esconde (no tapa la tarjeta ni sus botones) salvo en el paso
  // que le señala a él.
  const [guiaSenalaBlue, setGuiaSenalaBlue] = useState(false);
  // Aviso de Blue en el Foro: señala el botón del selector de pestañas (una vez por visita).
  const [avisoSelector, setAvisoSelector] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cuentaNueva, setCuentaNueva] = useState(false);
  const [unreadChats, setUnreadChats] = useState(0);
  const [likedUnavailable, setLikedUnavailable] = useState<string[]>([]);
  const [novedadesPending, setNovedadesPending] = useState(false);
  const [noticias, setNoticias] = useState<string[]>([]);
  // Avisos de Noticias Gaming: si están activados y cuántas hay sin ver.
  const [avisosNoticias, setAvisosNoticias] = useState(false);
  const [noticiasNuevas, setNoticiasNuevas] = useState(0);
  // La más reciente de las noticias nuevas: su aviso la abre directamente (dueño, 2026-11-04), no la lista.
  const [noticiaNueva, setNoticiaNueva] = useState<{ id: string; titulo: string } | null>(null);
  // Avisos de la tienda: artículos nuevos, «Avísame cuando llegue», bajadas de precio y,
  // solo el admin, ventas de VeoAura sin confirmar.
  const [avisosNovedades, setAvisosNovedades] = useState(false);
  const [novedadesTienda, setNovedadesTienda] = useState(0);
  const [avisosBusqueda, setAvisosBusqueda] = useState<AvisoBusqueda[]>([]);
  const [llegadas, setLlegadas] = useState<Llegada[]>([]);
  const [bajadas, setBajadas] = useState<Bajada[]>([]);
  // Envío gratis regalado por la tienda (dueño, 2026-11-23): Blue lo dice UNA vez por regalo.
  const [regalosEnvio, setRegalosEnvio] = useState<RegaloEnvio[]>([]);
  // Reservas de la cesta en marcha y el reloj con el que se cuenta lo que les queda.
  const [reservas, setReservas] = useState<ReservaAviso[]>([]);
  const [reloj, setReloj] = useState(() => Date.now());
  // Novedades de tus pedidos y reparaciones (etapa que ha cambiado desde la última vez que los viste en Seguimientos).
  const [segAvisos, setSegAvisos] = useState<SegAviso[]>([]);
  // Valoración tras la entrega (mejora 11): pedidos entregados hace 3 días o más y sin valorar (Blue lo dice una vez).
  const [valorarPend, setValorarPend] = useState<{ id: string; referencia: string | null }[]>([]);
  const segActualRef = useRef<{ uid: string; pedidos: PedidoSegDato[]; reparaciones: ReparacionSegDato[] } | null>(null);
  const [salidaPendiente, setSalidaPendiente] = useState(0);
  // Solo el admin: pedidos y reparaciones en curso que llevan 48 h o más sin ningún cambio (para que no se olviden).
  const [olvidados, setOlvidados] = useState<{ pedidos: number; reparaciones: number }>({ pedidos: 0, reparaciones: 0 });
  const isAdminRef = useRef(false);
  const arranqueHechoRef = useRef(false);
  // La cuenta del último aviso de Supabase (undefined = aún ninguno), para no releer todo con avisos repetidos.
  const uidAvisadoRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);
  const [textoAviso, setTextoAviso] = useState("");
  const [msgAviso, setMsgAviso] = useState<string | null>(null);
  const [bocadillo, setBocadillo] = useState<Bocadillo | null>(null);
  const bocadilloRef = useRef<Bocadillo | null>(null);
  bocadilloRef.current = bocadillo;
  const propuestaAbiertaRef = useRef(false);

  // Cola de los mensajes que Blue dice por su cuenta: el primero, como pronto a los 15 s de entrar en la pantalla; entre
  // uno y otro, 15 s. Al cambiar de pantalla la cola se vacía (cada pantalla vuelve a pedir los suyos).
  const entradaPantallaRef = useRef(Date.now());
  // Pantalla actual, para el filtro de mensajes del panel (la cola se atiende desde temporizadores).
  const pantallaRef = useRef(pathname);
  pantallaRef.current = pathname;
  const ultimoMensajeRef = useRef(0);
  const colaMensajesRef = useRef<Bocadillo[]>([]);
  const turnoMensajeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const atenderColaRef = useRef<() => void>(() => {});
  // Con el visor de fotos abierto Blue no se ve: lo que tenga que decir espera a que se cierre.
  const visorFotos = useSyncExternalStore(suscribirVisorFotos, visorFotosAbierto, () => false);
  // Consejo de un primer momento a la vista (mejora 12): mientras está, nada más sale (nunca dos a la vez).
  const [consejo, setConsejo] = useState<Bocadillo | null>(null);
  const consejoRef = useRef<Bocadillo | null>(null);
  consejoRef.current = consejo;
  atenderColaRef.current = () => {
    if (turnoMensajeRef.current) clearTimeout(turnoMensajeRef.current);
    turnoMensajeRef.current = null;
    // Dentro del panel, solo los mensajes de Administración; fuera, ninguno de ellos. Los consejos, solo en su pantalla.
    const enPanelAhora = pantallaRef.current.startsWith("/admin");
    colaMensajesRef.current = colaMensajesRef.current.filter((b) => !!b.panel === enPanelAhora && (!b.consejo || momentoEnPantalla(b.consejo, pantallaRef.current)));
    const siguiente = colaMensajesRef.current[0];
    // En una pantalla sin Blue no se dice nada (no se gasta el mensaje): al cambiar de pantalla la cola se vacía y cada
    // pantalla con Blue vuelve a pedir los suyos. Los consejos tienen su tarjeta y salen también donde Blue no está.
    // Con un consejo a la vista, lo siguiente espera a que se cierre (al cerrarse se vuelve a atender la cola).
    if (!siguiente || visorFotos || consejoRef.current || (!siguiente.consejo && !pantallaConBlue(pantallaRef.current))) return;
    // Con el panel de Blue abierto no sale nada (quedaría detrás del panel), y un consejo no sale encima de un mensaje que
    // aún se ve: espera un poco.
    if (panelOpenRef.current || (siguiente.consejo && bocadilloRef.current)) {
      turnoMensajeRef.current = setTimeout(() => atenderColaRef.current(), 2000);
      return;
    }
    const ahora = Date.now();
    const listo = Math.max(siguiente.trasAccion ? 0 : entradaPantallaRef.current + MENSAJE_TRAS_ENTRAR_MS, ultimoMensajeRef.current + ENTRE_MENSAJES_MS);
    if (ahora < listo) {
      turnoMensajeRef.current = setTimeout(() => atenderColaRef.current(), listo - ahora);
      return;
    }
    colaMensajesRef.current.shift();
    ultimoMensajeRef.current = ahora;
    if (siguiente.consejo) {
      setBocadillo(null);
      setConsejo(siguiente);
    } else setBocadillo(siguiente);
    if (colaMensajesRef.current.length) turnoMensajeRef.current = setTimeout(() => atenderColaRef.current(), ENTRE_MENSAJES_MS);
  };
  const decir = useCallback((b: Bocadillo) => {
    if (colaMensajesRef.current.some((x) => x.id === b.id)) return;
    colaMensajesRef.current.push(b);
    atenderColaRef.current();
  }, []);
  useEffect(() => {
    if (!visorFotos) atenderColaRef.current();
  }, [visorFotos]);
  // Instalar la tienda como app: cómo se ofrece en este dispositivo y los pasos de iPhone.
  const [modoInst, setModoInst] = useState<"prompt" | "ios" | null>(null);
  const [pasosIosAbiertos, setPasosIosAbiertos] = useState(false);
  const animPasosIos = useHojaAbajo(pasosIosAbiertos);
  // Propuesta de Blue al dueño (panel de administración): tema abierto, su respuesta y estado.
  const [propuesta, setPropuesta] = useState<TemaConocimiento | null>(null);
  const [respuestaProp, setRespuestaProp] = useState("");
  const [guardandoProp, setGuardandoProp] = useState(false);
  const [errorProp, setErrorProp] = useState<string | null>(null);
  propuestaAbiertaRef.current = !!propuesta;
  const cerrarPropuesta = useCallback(
    async (como: "ahora-no" | "no-aplica" | "guardada") => {
      const tema = propuesta?.tema;
      setPropuesta(null);
      setRespuestaProp("");
      setErrorProp(null);
      if (!tema || como === "guardada") return;
      const e = await leerEstadoProp();
      if (como === "ahora-no") e.hoyNo = [...new Set([...e.hoyNo, tema])];
      else e.descartados = [...new Set([...e.descartados, tema])];
      await guardarEstadoProp(e);
    },
    [propuesta]
  );
  const guardarPropuesta = useCallback(async () => {
    if (!propuesta || guardandoProp) return;
    setGuardandoProp(true);
    setErrorProp(null);
    const error = await guardarConocimiento(propuesta.tema, respuestaProp);
    setGuardandoProp(false);
    if (error) {
      setErrorProp(error);
      return;
    }
    await cerrarPropuesta("guardada");
    setBocadillo({ id: "prop-ok", texto: "¡Guardado! Desde ahora lo uso al responder a tus clientes.", panel: true });
  }, [propuesta, respuestaProp, guardandoProp, cerrarPropuesta]);
  useEffect(() => {
    const actualizar = () => setModoInst(modoInstalar());
    actualizar();
    oyentesInstalar.add(actualizar);
    return () => {
      oyentesInstalar.delete(actualizar);
    };
  }, []);
  const instalarApp = useCallback(async () => {
    setPanelOpen(false);
    medirEvento("instalar_toque", "Instalar app: toque");
    const ev = eventoInstalar;
    if (ev) {
      try {
        await ev.prompt();
        const r = await ev.userChoice;
        if (r.outcome === "accepted") medirEvento("instalar_aceptada", "Instalar app: aceptada");
      } catch {
        // el navegador no dejó abrir el diálogo
      }
      // El evento solo vale una vez.
      eventoInstalar = null;
      setModoInst(modoInstalar());
    } else if (esAppleMovil()) {
      setPasosIosAbiertos(true);
    }
  }, []);
  // Pestañas del panel de Blue: asistente, notificaciones (antes la campanita) y noticias.
  // Panel de Blue: «blue» = Asistente; «avisos» = «Noticias y avisos» (las notificaciones y las noticias, juntas).
  const [pestana, setPestana] = useState<"blue" | "avisos">("blue");
  // Aparición a los 10 s, mini saludo y oculto por scroll hacia abajo.
  const [aparecido, setAparecido] = useState(false);
  const [saludando, setSaludando] = useState(false);
  const [ocultoScroll, setOcultoScroll] = useState(false);
  // Hay un botón (o la lista de resultados del buscador) debajo de su sitio fijo: se esconde mientras tanto.
  const [algoDebajo, setAlgoDebajo] = useState(false);

  // --- posición -------------------------------------------------------------
  // Fijo arriba a la derecha desde el principio (ya no se recuerda un sitio elegido: no se arrastra).
  useEffect(() => {
    sitioRef.current = SITIO_FIJO;
    setSitio(SITIO_FIJO);
    const xy = posicionFija(pantallaRef.current === "/");
    posRef.current = xy;
    pan.setValue(xy);
    setReady(true);
  }, [pan]);

  // Lo lleva (con un muelle suave) a su sitio fijo, por ejemplo cuando el buscador de Inicio cambia de altura.
  const moverA = useCallback(
    (s: Sitio) => {
      sitioRef.current = s;
      setSitio(s);
      const xy = posicionFija(pantallaRef.current === "/");
      posRef.current = xy;
      // overshootClamping: el muelle no se pasa del sitio (no asoma fuera de la pantalla).
      Animated.spring(pan, { toValue: xy, useNativeDriver: false, friction: 8, tension: 50, overshootClamping: true }).start();
    },
    [pan]
  );

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", () => {
      const xy = posicionFija(pantallaRef.current === "/");
      posRef.current = xy;
      pan.setValue(xy);
    });
    return () => {
      // @ts-ignore — API antigua (RN<0.65) devuelve undefined
      sub?.remove?.();
    };
  }, [pan]);

  // --- datos -----------------------------------------------------------------
  const refreshAuth = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user ?? null;
      setIsLoggedIn(!!user);
      // Cuenta recién creada (menos de un día): Blue le cuenta sus ventajas una vez (consejo «cuenta», mejora 12).
      const creada = user?.created_at ? Date.parse(user.created_at) : NaN;
      setCuentaNueva(Number.isFinite(creada) && Date.now() - creada < CUENTA_NUEVA_MS);
      if (!user) {
        setIsAdmin(false);
        return;
      }
      setIsAdmin((await rolDeUsuario(user.id).catch(() => null)) === "admin");
    } catch {
      setIsLoggedIn(false);
      setIsAdmin(false);
    }
  }, []);

  const refreshChats = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        setUnreadChats(0);
        return;
      }
      const { data, error } = await supabase.rpc("get_unread_chat_count");
      if (error) throw error;
      setUnreadChats(typeof data === "number" ? data : 0);
    } catch {
      setUnreadChats(0);
    }
  }, []);

  const refreshLikes = useCallback(async () => {
    const ids = await getLikedProductIds();
    if (ids.length === 0) {
      setLikedUnavailable([]);
      return;
    }
    try {
      const { data, error } = await supabase.from("products").select("id").in("id", ids);
      if (error) throw error;
      const stillThere = new Set((data ?? []).map((r: { id: string }) => r.id));
      setLikedUnavailable(ids.filter((id) => !stillThere.has(id)));
    } catch {
      // sin conexión: se deja como estaba
    }
  }, []);

  const refreshNovedades = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(NOVEDADES_SEEN_KEY);
      const seenVersion = raw ? parseInt(raw, 10) : 0;
      setNovedadesPending(!(seenVersion >= NOVEDADES_CONTENT_VERSION));
    } catch {
      setNovedadesPending(false);
    }
  }, []);

  const refreshNoticias = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("flash_news")
        .select("message,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(5);
      if (error) throw error;
      setNoticias((data ?? []).map((r: { message: string | null }) => String(r.message ?? "").trim()).filter(Boolean));
    } catch {
      setNoticias([]);
    }
  }, []);

  // Noticias Gaming nuevas desde la última vez que se vieron (solo si hay avisos activados).
  const refreshNoticiasNuevas = useCallback(async () => {
    let avisoLocal: string | null = null;
    let vistasLocal: string | null = null;
    try {
      avisoLocal = await AsyncStorage.getItem(NOTICIAS_AVISOS_KEY);
      vistasLocal = await AsyncStorage.getItem(NOTICIAS_VISTAS_KEY);
    } catch {
      // sin almacenamiento local: se sigue con lo de la cuenta
    }

    let activado = avisoLocal === "1";
    let vistasCuenta: string | null = null;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (user) {
        const { data, error } = await supabase
          .from("preferencias_usuario")
          .select("avisos_noticias,noticias_vistas_hasta")
          .eq("user_id", user.id)
          .maybeSingle<{ avisos_noticias: boolean | null; noticias_vistas_hasta: string | null }>();
        if (error) throw error;
        // Con fila guardada manda la cuenta; sin fila, lo local.
        if (data) {
          activado = data.avisos_noticias === true;
          vistasCuenta = data.noticias_vistas_hasta;
        }
      }
    } catch {
      // la tabla puede no existir aún: solo lo local
    }

    setAvisosNoticias(activado);
    if (!activado) {
      setNoticiasNuevas(0);
      setNoticiaNueva(null);
      return;
    }

    const vistasMs = Math.max(isoAMs(vistasCuenta), isoAMs(vistasLocal));
    const desde = new Date(vistasMs || Date.now() - DIA_MS).toISOString();
    try {
      // Cuántas hay y cuál es la más reciente (su aviso la abre directamente).
      const { data, count, error } = await supabase
        .from("noticias_gaming")
        .select("id,titulo", { count: "exact" })
        .eq("publicada", true)
        .gt("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const ultima = (data ?? [])[0] as { id: string; titulo: string | null } | undefined;
      setNoticiasNuevas(count ?? 0);
      setNoticiaNueva(ultima ? { id: ultima.id, titulo: String(ultima.titulo ?? "").replace(/\s+/g, " ").trim() } : null);
    } catch {
      setNoticiasNuevas(0);
      setNoticiaNueva(null);
    }
  }, []);

  // Artículos nuevos en la tienda desde la última vez que se vieron (solo con cuenta y si lo activó; dueño, 2026-11-11:
  // es una ventaja de registrarse). Sin sesión no hay aviso ni se pregunta nada. Si en el dispositivo quedaba el ajuste
  // de antes (NOVEDADES_AVISOS_KEY = "1"), al iniciar sesión se pasa a la cuenta UNA vez y se quita del dispositivo.
  const refreshNovedadesTienda = useCallback(async () => {
    let local = false;
    let vistasLocal: string | null = null;
    let vistasCuenta: string | null = null;
    let user: { id: string } | null = null;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      user = sessionData.session?.user ?? null;
    } catch {
      user = null;
    }
    if (!user) {
      setAvisosNovedades(false);
      setNovedadesTienda(0);
      return;
    }
    try {
      local = (await AsyncStorage.getItem(NOVEDADES_AVISOS_KEY)) === "1";
      vistasLocal = await AsyncStorage.getItem(NOVEDADES_VISTAS_KEY);
    } catch {
      // sin almacenamiento local: se sigue con lo de la cuenta
    }
    let activado = false;
    try {
      const { data, error } = await supabase
        .from("preferencias_usuario")
        .select("avisos_novedades,novedades_vistas_hasta")
        .eq("user_id", user.id)
        .maybeSingle<{ avisos_novedades: boolean | null; novedades_vistas_hasta: string | null }>();
      if (error) throw error;
      activado = data?.avisos_novedades === true;
      vistasCuenta = data?.novedades_vistas_hasta ?? null;
      if (local && !activado) {
        const ahora = new Date().toISOString();
        const desdeLocal = vistasLocal && isoAMs(vistasLocal) ? vistasLocal : ahora;
        const { error: errorPaso } = await supabase
          .from("preferencias_usuario")
          .upsert({ user_id: user.id, avisos_novedades: true, novedades_vistas_hasta: desdeLocal, updated_at: ahora }, { onConflict: "user_id" });
        if (!errorPaso) {
          activado = true;
          vistasCuenta = desdeLocal;
        }
      }
      if (local && activado) AsyncStorage.removeItem(NOVEDADES_AVISOS_KEY).catch(() => {});
    } catch {
      // la columna puede no existir aún: con sesión, lo que hubiera en el dispositivo
      activado = local;
    }

    setAvisosNovedades(activado);
    if (!activado) {
      setNovedadesTienda(0);
      return;
    }
    const vistasMs = Math.max(isoAMs(vistasCuenta), isoAMs(vistasLocal));
    const desde = new Date(vistasMs || Date.now() - DIA_MS).toISOString();
    try {
      const { count, error } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("status", "PUBLISHED")
        .eq("is_active", true)
        .gt("novedad_en", desde);
      if (error) throw error;
      setNovedadesTienda(count ?? 0);
    } catch {
      setNovedadesTienda(0);
    }
  }, []);

  // «Avísame cuando llegue»: por cada búsqueda guardada, artículos con TODAS sus palabras
  // que han entrado (o vuelto a la venta) después de la última vez que se avisó.
  const refreshAvisosBusqueda = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        setAvisosBusqueda([]);
        setLlegadas([]);
        return;
      }
      // «Avisarme cuando haya otro» (pedidos cancelados): a la vez, y sin que un fallo suyo quite los de las búsquedas.
      const deReposicion = llegadasReposicion().catch(() => [] as Llegada[]);
      const { data, error } = await supabase
        .from("avisos_busqueda")
        .select("id,texto,visto_hasta")
        .order("created_at", { ascending: true })
        .limit(10);
      if (error) {
        setLlegadas(await deReposicion);
        throw error;
      }
      const avisos = (data ?? []) as AvisoBusqueda[];
      setAvisosBusqueda(avisos);

      const encontradas = await Promise.all(
        avisos.map(async (aviso) => {
          const palabras = aviso.texto
            .toLowerCase()
            .replace(/[%_\\,()]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length >= 2)
            .slice(0, 5);
          if (!palabras.length) return null;
          let consulta = supabase
            .from("products")
            .select("id,title,price_eur")
            .eq("status", "PUBLISHED")
            .eq("is_active", true)
            .gt("novedad_en", aviso.visto_hasta);
          for (const w of palabras) consulta = consulta.ilike("title", `%${w}%`);
          const { data: prods } = await consulta.order("novedad_en", { ascending: false }).limit(3);
          const productos = ((prods ?? []) as { id: string; title: string; price_eur: number | string | null }[]).map((p) => ({
            id: p.id,
            title: p.title,
            price: Number(p.price_eur ?? 0),
          }));
          return productos.length ? { aviso, productos } : null;
        })
      );
      setLlegadas([...(await deReposicion), ...encontradas.filter((x): x is Llegada => x !== null)]);
    } catch {
      // la tabla puede no existir aún: sin avisos de búsquedas (los de reposición ya se han puesto)
      setLlegadas((prev) => prev.filter((l) => l.reposicion));
    }
  }, []);

  // Bajadas de precio de lo que gusta (en este dispositivo y en la cuenta, misMeGustaServidor) o está en la cesta (precio
  // visto guardado en el móvil). Solo con cuenta (dueño, 2026-11-11): sin sesión no hay aviso.
  const refreshBajadas = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        setBajadas([]);
        return;
      }
      const [gustan, deCuenta, seguidos] = await Promise.all([getLikedProductIds(), misMeGustaServidor(), misAvisosPrecio()]);
      const cesta = await leerJsonLocal<unknown[]>(CART_KEY, []);
      const enCesta = (Array.isArray(cesta) ? cesta : [])
        .map((it: any) => String(it?.id ?? ""))
        .filter(Boolean);
      // «Avísame si baja de precio» (avisos_precio): se compara con el precio guardado al activarlo (o el último avisado).
      const refSeguido = new Map((seguidos ?? []).map((a) => [a.product_id, precioReferenciaAviso(a)]));
      const ids = [...new Set([...refSeguido.keys(), ...gustan, ...(deCuenta?.productos ?? []), ...enCesta])].slice(0, 80);
      if (!ids.length) {
        setBajadas([]);
        return;
      }
      const { data, error } = await supabase.from("products").select("id,title,price_eur").in("id", ids);
      if (error) throw error;
      const vistos = await leerJsonLocal<Record<string, number>>(PRECIOS_VISTOS_KEY, {});
      const nuevos: Record<string, number> = {};
      const lista: Bajada[] = [];
      for (const p of (data ?? []) as { id: string; title: string; price_eur: number | string | null }[]) {
        const ahora = Number(p.price_eur ?? 0);
        const ref = refSeguido.get(p.id);
        if (ref !== undefined) {
          if (ahora > 0 && ahora < ref - 0.004) lista.push({ id: p.id, title: p.title, antes: ref, ahora, seguido: true });
          continue;
        }
        const antes = Number(vistos[p.id]);
        if (Number.isFinite(antes) && antes > 0 && ahora > 0 && ahora < antes - 0.004) {
          lista.push({ id: p.id, title: p.title, antes, ahora });
          nuevos[p.id] = antes; // se mantiene hasta que lo vea
        } else {
          nuevos[p.id] = ahora; // primera vez o sube: se apunta el precio actual
        }
      }
      await AsyncStorage.setItem(PRECIOS_VISTOS_KEY, JSON.stringify(nuevos)).catch(() => {});
      // Primero las que el cliente pidió seguir.
      lista.sort((a, b) => Number(!!b.seguido) - Number(!!a.seguido));
      setBajadas((previa) =>
        previa.length === lista.length && previa.every((b, i) => b.id === lista[i].id && b.ahora === lista[i].ahora && b.antes === lista[i].antes) ? previa : lista
      );
    } catch {
      // sin conexión: se deja como estaba
    }
  }, []);

  // Solo el admin: ventas de artículos de VeoAura que aún no se han confirmado a VeoAura.
  const refreshSalida = useCallback(async () => {
    // Un cliente nunca la ve (RLS le cuenta 0): ni se pregunta (carga rápida, 2026-11-14). Al saberse que es el
    // administrador, la mira el efecto de isAdmin (más abajo).
    if (!isAdminRef.current) {
      setSalidaPendiente(0);
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        setSalidaPendiente(0);
        return;
      }
      // Solo ventas sin confirmar («pedido» y «pedido_anulado»): el aviso con la ficha del cliente («pedido_pagado»)
      // no es una venta pendiente.
      const { count, error } = await supabase
        .from("escaparate_salida")
        .select("id", { count: "exact", head: true })
        .in("estado", ["pendiente", "error"])
        .in("evento", ["pedido", "pedido_anulado"]);
      // Para quien no es admin, RLS no devuelve filas: cuenta 0.
      setSalidaPendiente(error ? 0 : count ?? 0);
    } catch {
      setSalidaPendiente(0);
    }
  }, []);

  // Solo el admin: pedidos y reparaciones en curso sin ningún cambio desde hace 48 h o más (updated_at, que la base de
  // datos pone al día en cada cambio). Cuenta sin descargar filas.
  const refreshOlvidados = useCallback(async () => {
    if (!isAdminRef.current) {
      setOlvidados((o) => (o.pedidos || o.reparaciones ? { pedidos: 0, reparaciones: 0 } : o));
      return;
    }
    try {
      const limite = new Date(Date.now() - OLVIDO_MS).toISOString();
      const [ped, rep] = await Promise.all([
        supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .in("estado", ["pendiente", "confirmado", "preparado", "enviado"])
          .lt("updated_at", limite),
        supabase
          .from("service_requests")
          .select("id", { count: "exact", head: true })
          .neq("status", "descartado")
          .or("seguimiento.is.null,seguimiento.not.in.(entregado,cancelado)")
          .lt("updated_at", limite),
      ]);
      const pedidos = ped.error ? 0 : ped.count ?? 0;
      const reparaciones = rep.error ? 0 : rep.count ?? 0;
      setOlvidados((o) => (o.pedidos === pedidos && o.reparaciones === reparaciones ? o : { pedidos, reparaciones }));
    } catch {
      // sin conexión: se deja como estaba
    }
  }, []);

  // Reservas de la cesta que siguen en marcha (la cesta guarda en el móvil hasta cuándo vale cada una). Las ya vencidas
  // no cuentan: la pantalla Cesta las retira cuando se abre.
  const refreshReservas = useCallback(async () => {
    const cesta = await leerJsonLocal<unknown[]>(CART_KEY, []);
    const ahora = Date.now();
    const lista: ReservaAviso[] = [];
    for (const it of Array.isArray(cesta) ? cesta : []) {
      const fila = (it ?? {}) as { id?: unknown; title?: unknown; reservedUntil?: unknown };
      const id = String(fila.id ?? "");
      const hasta = Number(fila.reservedUntil);
      if (id && Number.isFinite(hasta) && hasta > ahora) lista.push({ id, title: String(fila.title ?? "").trim() || "un artículo", hasta });
    }
    lista.sort((a, b) => a.hasta - b.hasta);
    // Sin cambios no se repinta (se mira cada 15 s).
    setReservas((previa) =>
      previa.length === lista.length && previa.every((r, i) => r.id === lista[i].id && r.hasta === lista[i].hasta) ? previa : lista
    );
    if (lista.length) setReloj(ahora);
  }, []);

  // Compara lo último que se leyó de pedidos y reparaciones con lo que la persona ya vio (sin pedir nada a la red).
  const recalcularSeguimientos = useCallback(async () => {
    const actual = segActualRef.current;
    if (!actual) {
      setSegAvisos([]);
      return;
    }
    const vistos = await leerVistosSeg(actual.uid);
    if (!vistos) {
      // Primera vez en este dispositivo: se apunta lo que hay y no se avisa de lo antiguo.
      const base: VistosSeg = { p: {}, r: {} };
      for (const p of actual.pedidos) base.p[p.id] = p.estado;
      for (const r of actual.reparaciones) base.r[r.id] = `${r.etapa}|${r.actualizado}`;
      await guardarVistosSeg(actual.uid, base);
      setSegAvisos([]);
      return;
    }
    const { avisos, adoptar } = calcularSegAvisos(actual.pedidos, actual.reparaciones, vistos);
    if (Object.keys(adoptar.p).length || Object.keys(adoptar.r).length) {
      await guardarVistosSeg(actual.uid, { p: { ...vistos.p, ...adoptar.p }, r: { ...vistos.r, ...adoptar.r } });
    }
    setSegAvisos((previos) =>
      previos.length === avisos.length && previos.every((a, i) => a.clave === avisos[i].clave) ? previos : avisos
    );
  }, []);

  // Pedidos y reparaciones de la persona (solo con sesión; cada una ve lo suyo). Si faltan las tablas o las columnas de
  // seguimiento (migración sin aplicar) no hay avisos y no se rompe nada.
  const refreshSeguimientos = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id;
      if (!uid) {
        segActualRef.current = null;
        setSegAvisos([]);
        return;
      }
      // Con la devolución del pago con tarjeta (migración 20261106100000); sin la columna, como antes.
      const pedidosCon = (columnas: string) => supabase.from("pedidos").select(columnas).eq("user_id", uid).limit(50);
      const reparacionesCon = (columnas: string) => supabase.from("service_requests").select(columnas).eq("customer_user_id", uid).limit(50);
      const BASE_REP = "id,service_title,seguimiento,seguimiento_actualizado";
      const [pedPrimero, repPrimero] = await Promise.all([
        pedidosCon("id,numero,codigo_seguimiento,estado,entrega,devuelto_en"),
        reparacionesCon(sinEntregaModo ? BASE_REP : `${BASE_REP},entrega_modo`),
      ]);
      let rep = repPrimero;
      if (rep.error && /entrega_modo/.test(String(rep.error.message ?? ""))) {
        sinEntregaModo = true;
        rep = await reparacionesCon(BASE_REP);
      }
      const ped =
        pedPrimero.error && /devuelto_en/.test(String(pedPrimero.error.message ?? "")) ? await pedidosCon("id,numero,codigo_seguimiento,estado,entrega") : pedPrimero;
      segActualRef.current = {
        uid,
        pedidos: ped.error
          ? []
          : ((ped.data ?? []) as unknown as { id: string; numero: number | null; codigo_seguimiento?: string | null; estado: string | null; entrega: string | null; devuelto_en?: string | null }[]).map(
              (p) => ({
                id: String(p.id),
                numero: p.numero ?? null,
                referencia: p.codigo_seguimiento ?? null,
                estado: firmaPedidoSeg(p.estado, p.devuelto_en),
                entrega: p.entrega ?? null,
              })
            ),
        reparaciones: rep.error
          ? []
          : ((rep.data ?? []) as unknown as { id: string; service_title: string | null; seguimiento: string | null; seguimiento_actualizado: string | null; entrega_modo?: string | null }[]).map(
              (r) => ({
                id: String(r.id),
                titulo: String(r.service_title ?? "").trim() || "Servicio",
                etapa: String(r.seguimiento ?? "solicitado"),
                actualizado: String(r.seguimiento_actualizado ?? ""),
                porEnvio: r.entrega_modo === "correos",
              })
            ),
      };
      await recalcularSeguimientos();
      // Valoración tras la entrega: solo los entregados que Blue aún no ha pedido en este dispositivo (sin consultas si no
      // hay ninguno). Sin la hora del paso «entregado» (pedido_estados) no se pide; sin la migración, nada.
      const ahora = Date.now();
      const entregados = (segActualRef.current?.pedidos ?? []).filter(
        (p) => p.estado === "entregado" && !valorarResueltos.has(p.id) && (valorarDesde.get(p.id) ?? 0) <= ahora
      );
      if (!entregados.length) {
        setValorarPend((v) => (v.length ? [] : v));
        return;
      }
      const dichos = await cargarDichos();
      const porPedir = entregados.filter((p) => !dichos.has(`vp:${p.id}`));
      for (const p of entregados) if (dichos.has(`vp:${p.id}`)) valorarResueltos.add(p.id);
      if (!porPedir.length) {
        setValorarPend((v) => (v.length ? [] : v));
        return;
      }
      const ids = porPedir.map((p) => p.id);
      const [hist, vals] = await Promise.all([cargarHistorialPedidos(ids), cargarValoracionesPedidos(ids)]);
      if (!hist || !vals) {
        setValorarPend((v) => (v.length ? [] : v));
        return;
      }
      for (const id of Object.keys(vals)) valorarResueltos.add(id);
      // Entregados hace menos de 3 días: no se vuelven a consultar hasta que toque.
      for (const p of porPedir) {
        const t = Date.parse(entregadoEnDe(hist[p.id]) ?? "");
        if (Number.isFinite(t) && t + VALORACION_ESPERA_MS > ahora) valorarDesde.set(p.id, t + VALORACION_ESPERA_MS);
      }
      const lista = porPedir
        .filter((p) => tocaValorarPedido("entregado", entregadoEnDe(hist[p.id]), !!vals[p.id]))
        .map((p) => ({ id: p.id, referencia: p.referencia ?? null }));
      setValorarPend((v) => (v.length === lista.length && v.every((x, i) => x.id === lista[i].id) ? v : lista));
    } catch {
      // sin conexión: se deja como estaba
    }
  }, [recalcularSeguimientos]);

  const refreshRegalosEnvio = useCallback(async () => {
    const lista = await cargarMisEnviosGratis();
    setRegalosEnvio((prev) => (prev.length === lista.length && prev.every((r, i) => r.id === lista[i].id && r.usados === lista[i].usados) ? prev : lista));
  }, []);

  const refreshAvisosTienda = useCallback(() => {
    refreshNovedadesTienda();
    refreshAvisosBusqueda();
    void refreshRegalosEnvio();
    refreshBajadas();
    refreshSalida();
    refreshOlvidados();
    refreshReservas();
    refreshSeguimientos();
  }, [refreshNovedadesTienda, refreshAvisosBusqueda, refreshRegalosEnvio, refreshBajadas, refreshSalida, refreshOlvidados, refreshReservas, refreshSeguimientos]);
  useEffect(() => alCambiarRegalosEnvio(() => void refreshRegalosEnvio()), [refreshRegalosEnvio]);

  // En cuanto se sabe que es el admin, se miran los pedidos y reparaciones olvidados (y cada 10 minutos).
  useEffect(() => {
    if (!isAdmin) return;
    refreshOlvidados();
    refreshSalida();
    const t = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") refreshOlvidados();
    }, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [isAdmin, refreshOlvidados, refreshSalida]);

  // Perfil → Seguimientos ha enseñado las novedades: se quitan los avisos sin volver a pedir nada. Y cada 2 minutos (con la
  // pestaña visible) se miran los cambios de la tienda.
  useEffect(() => {
    oyentesSeguimientos.add(recalcularSeguimientos);
    const t = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") refreshSeguimientos();
    }, RELOJ_SEGUIMIENTOS_MS);
    return () => {
      oyentesSeguimientos.delete(recalcularSeguimientos);
      clearInterval(t);
    };
  }, [recalcularSeguimientos, refreshSeguimientos]);

  // Cuenta atrás de las reservas: se relee la cesta al cambiar de pantalla y cada 15 s (con la pestaña oculta, no).
  useEffect(() => {
    refreshReservas();
  }, [pathname, refreshReservas]);
  useEffect(() => {
    const t = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") refreshReservas();
    }, RELOJ_RESERVAS_MS);
    return () => clearInterval(t);
  }, [refreshReservas]);

  // El catálogo puede crear avisos: entonces se releen.
  useEffect(() => {
    const oyente = () => {
      refreshAvisosBusqueda();
    };
    oyentesAvisos.add(oyente);
    return () => {
      oyentesAvisos.delete(oyente);
    };
  }, [refreshAvisosBusqueda]);
  // La ficha activa o quita un «Avísame si baja de precio»: se releen las bajadas (sin sondeo nuevo).
  useEffect(() => alCambiarAvisosPrecio(() => refreshBajadas()), [refreshBajadas]);
  // Mis pedidos enciende, apaga o cambia un «Avisarme cuando haya otro»: se releen las llegadas.
  useEffect(() => alCambiarAvisosReposicion(() => refreshAvisosBusqueda()), [refreshAvisosBusqueda]);

  useEffect(() => {
    // Carga rápida (mejora 7, 2026-11-14): lo de Blue se lee cuando la pantalla ya está pintada (con el navegador libre o,
    // como mucho, a los 1,5 s), para que las consultas de los productos de la pantalla salgan primero.
    // Una sola vez por montaje: si este efecto se vuelve a preparar (cambia alguna de sus funciones, p. ej. al cambiar de
    // pantalla), no se repite todo el arranque (en Inicio salían las mismas 6 consultas dos veces).
    const cancelarArranque = trasPrimeraPintura(() => {
      if (arranqueHechoRef.current) return;
      arranqueHechoRef.current = true;
      refreshAuth();
      refreshChats();
      refreshLikes();
      refreshNovedades();
      refreshNoticias();
      refreshAvisosTienda();
    });
    // refreshNoticiasNuevas() al montar lo hace el efecto de la ruta (más abajo).

    const hasDocument = typeof document !== "undefined";
    const isPageVisible = () => !hasDocument || document.visibilityState !== "hidden";
    const interval = setInterval(() => {
      if (!isPageVisible()) {
        // En segundo plano solo se mira el chat, y solo si hay avisos del navegador activados.
        if (estadoNotificaciones() === "activadas") refreshChats();
        return;
      }
      refreshChats();
      refreshNoticiasNuevas();
      refreshNovedadesTienda();
    }, POLL_MS);

    let onVisibilityChange: (() => void) | null = null;
    if (hasDocument) {
      onVisibilityChange = () => {
        if (document.visibilityState !== "visible") return;
        refreshChats();
        refreshNoticiasNuevas();
        refreshAvisosTienda();
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    // Solo al entrar, salir o cambiar la cuenta: con cada renovación del token (TOKEN_REFRESHED) no se relee nada (sesión
    // estable, 2026-11-14: esas relecturas pedían otra vez la sesión y alimentaban el bucle de renovaciones).
    // Tampoco con INITIAL_SESSION (el aviso que Supabase da nada más suscribirse, con la sesión ya guardada): lo acaba de
    // leer todo el arranque de arriba y se repetían las mismas 8 consultas (carga rápida, mejora 7 del 2026-11-14).
    // Ni con el SIGNED_IN que Supabase repite al recuperar la sesión guardada de la MISMA cuenta (solo cuenta un cambio de
    // cuenta de verdad: entrar, salir o entrar con otra).
    const { data: authSub } = supabase.auth.onAuthStateChange((evento, sesion) => {
      // El primer aviso (sea INITIAL_SESSION o el SIGNED_IN de recuperarla, según cuál llegue antes) es la sesión con la
      // que se abrió la tienda: ya la lee el arranque.
      const uid = sesion?.user?.id ?? null;
      const primero = uidAvisadoRef.current === undefined;
      const mismaCuenta = uid === uidAvisadoRef.current;
      uidAvisadoRef.current = uid;
      if (primero || evento === "TOKEN_REFRESHED" || evento === "INITIAL_SESSION") return;
      if (evento === "SIGNED_IN" && mismaCuenta) return;
      refreshAuth();
      refreshChats();
      refreshNoticiasNuevas();
      refreshAvisosTienda();
    });

    // «Desliza para actualizar» (components/TirarParaActualizar.tsx): también se ponen al día los avisos y noticias.
    const quitarRecarga = alRecargar(() => {
      refreshChats();
      refreshNoticiasNuevas();
      refreshAvisosTienda();
      refreshNovedadesTienda();
    });

    return () => {
      cancelarArranque();
      clearInterval(interval);
      if (hasDocument && onVisibilityChange) document.removeEventListener("visibilitychange", onVisibilityChange);
      authSub?.subscription?.unsubscribe?.();
      quitarRecarga();
    };
  }, [
    refreshAuth,
    refreshChats,
    refreshLikes,
    refreshNovedades,
    refreshNoticias,
    refreshNoticiasNuevas,
    refreshNovedadesTienda,
    refreshAvisosTienda,
  ]);

  // Cuenta las noticias al montar y otra vez al salir del Foro (donde se ven y se
  // actualiza la clave local de "vistas"), para que el número rojo no se quede viejo.
  const enForo = pathname.startsWith("/chat-global");

  // En el Foro Blue no se queda en pantalla (taparía el campo de escribir), pero sale UNA sola
  // vez por dispositivo (queda guardado), a los 2,5 s, para señalar el botón azul del selector de
  // pestañas. Si ya lo vio en la guía de Blue, tampoco sale.
  useEffect(() => {
    if (!enForo || guiaAbierta || yaDicho.has("selector-pestanas") || Platform.OS !== "web") return;
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        // Con el aviso de cookies sin contestar, Blue no habla (lo taparía).
        if (!vivo || (await leerConsentimientoAnalitica()) === null || !vivo) return;
        if ((await AsyncStorage.getItem(SELECTOR_VISTO_KEY)) === "1" || !vivo) return;
        yaDicho.add("selector-pestanas");
        AsyncStorage.setItem(SELECTOR_VISTO_KEY, "1").catch(() => {});
        setAvisoSelector(true);
      } catch {
        // sin aviso si falla
      }
    }, 2500);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [enForo, guiaAbierta]);
  useEffect(() => {
    if (!enForo) setAvisoSelector(false);
  }, [enForo]);
  useEffect(() => {
    if (!enForo) refreshNoticiasNuevas();
  }, [enForo, refreshNoticiasNuevas]);

  // Aviso del navegador cuando llegan mensajes nuevos al chat y la pestaña está en segundo plano
  // (solo si la persona activó las notificaciones; lib/notificaciones.ts). Los primeros 8 s no
  // cuentan: son los mensajes que ya estaban sin leer al abrir la tienda.
  const montadoEnRef = useRef(Date.now());
  const chatsPrevRef = useRef(0);
  useEffect(() => {
    const antes = chatsPrevRef.current;
    chatsPrevRef.current = unreadChats;
    if (unreadChats <= antes || Date.now() - montadoEnRef.current < 8000) return;
    notificarMensajeNuevo(unreadChats - antes, () => router.push((isAdmin ? "/admin/chats" : "/chat-global?tab=privados") as Href));
  }, [unreadChats, isAdmin]);

  // Reservas en marcha (salen como aviso) y, de ellas, las que vencen en 5 minutos o menos (suman al número rojo).
  const reservasActivas = React.useMemo(() => reservas.filter((r) => r.hasta > reloj), [reservas, reloj]);
  const reservasPorVencer = React.useMemo(() => reservasActivas.filter((r) => r.hasta - reloj <= RESERVA_AVISO_MS), [reservasActivas, reloj]);
  // Lo del Panel de control: clientes que han escrito, ventas de VeoAura sin confirmar y pedidos o reparaciones olvidados.
  const avisosPanel =
    unreadChats + (isAdmin && salidaPendiente > 0 ? 1 : 0) + (isAdmin && olvidados.pedidos + olvidados.reparaciones > 0 ? 1 : 0);
  // Dentro del panel (petición del dueño, 2026-11-01), Blue solo habla de lo del panel: el número rojo y su ventana no
  // cuentan ni enseñan los avisos de la tienda (Foro, noticias, artículos nuevos, favoritos, reservas…).
  const totalCount = enAdmin
    ? avisosPanel
    : avisosPanel +
      likedUnavailable.length +
      (novedadesPending ? 1 : 0) +
      noticiasNuevas +
      (novedadesTienda > 0 ? 1 : 0) +
      llegadas.length +
      bajadas.length +
      reservasPorVencer.length +
      segAvisos.length;
  const badgeLabel = totalCount > 9 ? "9+" : String(totalCount);

  // --- bocadillos según la pantalla --------------------------------------------
  // Pantalla nueva: vuelven a contar los 15 s antes del primer mensaje y se olvida lo que esperaba turno.
  useEffect(() => {
    entradaPantallaRef.current = Date.now();
    colaMensajesRef.current = [];
    if (turnoMensajeRef.current) clearTimeout(turnoMensajeRef.current);
    turnoMensajeRef.current = null;
    // El consejo a la vista es de su pantalla: al salir de ella se va (ya quedó dicho al enseñarse).
    setConsejo((c) => (c?.consejo && !momentoEnPantalla(c.consejo, pathname) ? null : c));
  }, [pathname]);
  useEffect(
    () => () => {
      const turno = turnoMensajeRef;
      if (turno.current) clearTimeout(turno.current);
    },
    []
  );

  useEffect(() => {
    setBocadillo(null);
    if (enAdmin || guiaAbierta || pathname.startsWith("/checkout") || pathname.startsWith("/blue-ia")) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let vivo = true;
    const m = pathname.match(/^\/producto\/([0-9a-f-]{36})/i);

    if (m) {
      const id = m[1];
      if (yaDicho.has(`p:${id}`)) return;
      timers.push(
        setTimeout(async () => {
          try {
            const { data } = await supabase
              .from("products")
              .select("title,description")
              .eq("id", id)
              .maybeSingle<{ title: string; description: string | null }>();
            if (!vivo || !data?.title) return;
            // Con el aviso de cookies aún sin contestar, Blue no habla (lo taparía).
            if ((await leerConsentimientoAnalitica()) === null || !vivo) return;
            yaDicho.add(`p:${id}`);
            const titulo = data.title.trim();
            const ruta = `/blue-ia?producto=${id}`;
            decir({ id: `p1:${id}`, texto: mensajeProducto(titulo, data.description), accion: "chat", ruta });
            timers.push(
              setTimeout(() => {
                if (!vivo) return;
                // Habla de entregas y envíos: al tocarlo, la política de envíos (espera su turno: 15 s tras el anterior).
                decir({
                  id: `p2:${id}`,
                  texto: "Realizamos entregas en persona en la ciudad de Zaragoza o envíos a toda España.",
                  accion: "ruta",
                  ruta: "/politicas/envios",
                });
              }, SEGUNDO_MENSAJE_MS)
            );
          } catch {
            // sin bocadillo si falla
          }
        }, PRODUCTO_ESPERA_MS)
      );
    } else if (noticias.length) {
      const pendiente = noticias.find((n) => !yaDicho.has(`n:${n}`));
      if (pendiente) {
        timers.push(
          setTimeout(async () => {
            // Con el aviso de cookies aún sin contestar, Blue no habla (lo taparía).
            if (!vivo || (await leerConsentimientoAnalitica()) === null || !vivo) return;
            yaDicho.add(`n:${pendiente}`);
            decir({ id: `n:${pendiente}`, texto: pendiente, ...destinoDeAviso(pendiente) });
          }, NOTICIA_ESPERA_MS)
        );
      }
    }

    return () => {
      vivo = false;
      timers.forEach(clearTimeout);
    };
  }, [pathname, enAdmin, noticias, guiaAbierta, decir]);

  // Animación de entrada del bocadillo.
  const bocAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!bocadillo) return;
    bocAnim.setValue(0);
    Animated.timing(bocAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [bocadillo, bocAnim]);

  // --- aparición, saludo y scroll ---------------------------------------------------
  // 10 s desde que se abrió la página (performance.now() cuenta desde la carga).
  useEffect(() => {
    const yaPasado = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : 0;
    const timer = setTimeout(() => setAparecido(true), Math.max(0, APARECER_MS - yaPasado));
    return () => clearTimeout(timer);
  }, []);

  const entrada = useRef(new Animated.Value(0)).current;
  const saludo = useRef(new Animated.Value(0)).current;
  const chipAnim = useRef(new Animated.Value(0)).current;
  const ocultar = useRef(new Animated.Value(0)).current;
  const entradaHechaRef = useRef(false);
  const enPantalla = aparecido && ready && !sinBlue;

  // Una reserva de la cesta a punto de vencer: un mensaje de Blue, UNA vez por reserva y solo si Blue no está diciendo otra cosa.
  // No sale en la Cesta (allí ya se ve la cuenta atrás) ni en el pedido, y con el aviso de cookies sin contestar Blue no habla.
  useEffect(() => {
    if (!enPantalla || enAdmin || guiaAbierta || panelOpen || bocadillo) return;
    if (pathname.startsWith("/cesta") || pathname.startsWith("/checkout") || pathname.startsWith("/blue-ia")) return;
    const r = reservasPorVencer.find((x) => !yaDicho.has(`r:${x.id}:${x.hasta}`));
    if (!r) return;
    let vivo = true;
    (async () => {
      if ((await leerConsentimientoAnalitica()) === null || !vivo) return;
      yaDicho.add(`r:${r.id}:${r.hasta}`);
      const titulo = r.title.length > 40 ? `${r.title.slice(0, 39).trimEnd()}…` : r.title;
      decir({
        id: `r:${r.id}`,
        texto: `Tu reserva de «${titulo}» vence en ${minutosQueQuedan(r.hasta - Date.now())} min.`,
        accion: "ruta",
        ruta: "/cesta",
      });
    })();
    return () => {
      vivo = false;
    };
  }, [enPantalla, enAdmin, guiaAbierta, panelOpen, bocadillo, pathname, reservasPorVencer, decir]);

  // Una novedad de tu pedido o reparación: un mensaje de Blue, UNA vez por cambio y solo si Blue no está diciendo otra cosa. No
  // sale en Perfil (allí están los seguimientos), ni en el pedido; con el aviso de cookies sin contestar Blue no habla.
  useEffect(() => {
    if (!enPantalla || enAdmin || guiaAbierta || panelOpen || bocadillo) return;
    if (pathname.startsWith("/perfil") || pathname.startsWith("/checkout") || pathname.startsWith("/blue-ia")) return;
    const candidatos = segAvisos.filter((x) => !yaDicho.has(`s:${x.clave}`));
    if (!candidatos.length) return;
    let vivo = true;
    (async () => {
      if ((await leerConsentimientoAnalitica()) === null || !vivo) return;
      // Una vez por cambio también entre visitas (mejora 5): lo ya dicho en este dispositivo no se repite.
      const dichos = await cargarDichos();
      if (!vivo) return;
      const a = candidatos.find((x) => !dichos.has(`s:${x.clave}`));
      for (const x of candidatos) if (x !== a && dichos.has(`s:${x.clave}`)) yaDicho.add(`s:${x.clave}`);
      if (!a) return;
      yaDicho.add(`s:${a.clave}`);
      // Pedidos: «Tu pedido VZ-… está enviado · Ver seguimiento» (dueño, 2026-11-14).
      decir({ id: `s:${a.clave}`, texto: a.tipo === "pedido" ? `${a.texto} · Ver seguimiento` : `${a.texto}.`, accion: "ruta", ruta: "/perfil?tab=seguimientos" });
    })();
    return () => {
      vivo = false;
    };
  }, [enPantalla, enAdmin, guiaAbierta, panelOpen, bocadillo, pathname, segAvisos, decir]);

  // Una bajada de precio de lo que el cliente sigue («Avísame si baja de precio»): un mensaje de Blue UNA vez por bajada
  // (guardado en el dispositivo y, en la cuenta, el precio avisado). No en el pago ni en Blue IA.
  useEffect(() => {
    if (!enPantalla || enAdmin || guiaAbierta || panelOpen || bocadillo) return;
    if (pathname.startsWith("/checkout") || pathname.startsWith("/blue-ia")) return;
    const candidatos = bajadas.filter((b) => b.seguido && !yaDicho.has(`ap:${b.id}:${b.ahora}`));
    if (!candidatos.length) return;
    let vivo = true;
    (async () => {
      if ((await leerConsentimientoAnalitica()) === null || !vivo) return;
      const dichos = await cargarDichos();
      if (!vivo) return;
      const b = candidatos.find((x) => !dichos.has(`ap:${x.id}:${x.ahora}`));
      if (!b) return;
      yaDicho.add(`ap:${b.id}:${b.ahora}`);
      const titulo = b.title.length > 48 ? `${b.title.slice(0, 47).trimEnd()}…` : b.title;
      decir({ id: `ap:${b.id}:${b.ahora}`, texto: `Ha bajado de precio: ${titulo}, ahora ${formatearEuros(b.ahora)}`, accion: "ruta", ruta: `/producto/${b.id}` });
    })();
    return () => {
      vivo = false;
    };
  }, [enPantalla, enAdmin, guiaAbierta, panelOpen, bocadillo, pathname, bajadas, decir]);

  // Envío gratis regalado por la tienda (dueño, 2026-11-23): «Regalo de la tienda: envío gratis en tus próximos 3 artículos»
  // UNA vez por regalo (queda dicho al enseñarse). No en el pago ni en Blue IA.
  useEffect(() => {
    if (!enPantalla || enAdmin || guiaAbierta || panelOpen || bocadillo) return;
    if (pathname.startsWith("/checkout") || pathname.startsWith("/blue-ia")) return;
    const candidatos = regalosEnvio.filter((r) => !yaDicho.has(`eg:${r.id}`));
    if (!candidatos.length) return;
    let vivo = true;
    (async () => {
      if ((await leerConsentimientoAnalitica()) === null || !vivo) return;
      const dichos = await cargarDichos();
      if (!vivo) return;
      const r = candidatos.find((x) => !dichos.has(`eg:${x.id}`));
      for (const x of candidatos) if (x !== r && dichos.has(`eg:${x.id}`)) yaDicho.add(`eg:${x.id}`);
      if (!r) return;
      yaDicho.add(`eg:${r.id}`);
      const texto = r.modo === "articulo" ? "Regalo de la tienda: tienes envío gratis en un artículo elegido para ti" : `Regalo de la tienda: ${textoRegaloEnvio(r).replace(/^Envío gratis/, "envío gratis")}`;
      decir({ id: `eg:${r.id}`, texto, accion: "ruta", ruta: r.modo === "articulo" && r.product_id ? `/producto/${r.product_id}` : "/perfil?envioGratis=1" });
    })();
    return () => {
      vivo = false;
    };
  }, [enPantalla, enAdmin, guiaAbierta, panelOpen, bocadillo, pathname, regalosEnvio, decir]);

  // Valoración tras la entrega (mejora 11): «¿Qué tal tu pedido VZ-…? Valóralo en 10 segundos», UNA vez por pedido (queda
  // dicho al enseñarse). No en Perfil (allí está el botón), ni en el pago ni en Blue IA.
  useEffect(() => {
    if (!enPantalla || enAdmin || guiaAbierta || panelOpen || bocadillo) return;
    if (pathname.startsWith("/perfil") || pathname.startsWith("/checkout") || pathname.startsWith("/blue-ia")) return;
    const candidatos = valorarPend.filter((x) => !yaDicho.has(`vp:${x.id}`));
    if (!candidatos.length) return;
    let vivo = true;
    (async () => {
      if ((await leerConsentimientoAnalitica()) === null || !vivo) return;
      const dichos = await cargarDichos();
      if (!vivo) return;
      const v = candidatos.find((x) => !dichos.has(`vp:${x.id}`));
      if (!v) return;
      yaDicho.add(`vp:${v.id}`);
      const ref = v.referencia ? ` ${v.referencia}` : "";
      decir({ id: `vp:${v.id}`, texto: `¿Qué tal tu pedido${ref}? Valóralo en 10 segundos`, accion: "ruta", ruta: "/perfil?tab=seguimientos" });
    })();
    return () => {
      vivo = false;
    };
  }, [enPantalla, enAdmin, guiaAbierta, panelOpen, bocadillo, pathname, valorarPend, decir]);

  // Cuando un aviso de pedido o de precio se ve de verdad: queda dicho en el dispositivo (no se repite), la bajada se apunta
  // en la cuenta y se mide (sin datos personales: el estado del pedido o el producto).
  useEffect(() => {
    if (!bocadillo) return;
    const id = bocadillo.id;
    if (id.startsWith("s:p:")) {
      void apuntarDicho(id);
      const estado = (id.split(":")[3] ?? "").split("|")[0];
      void medirEvento("pedido_aviso_estado_mostrado", "Blue: aviso de estado del pedido mostrado", { metadata: { estado } });
    } else if (id.startsWith("s:r:")) {
      void apuntarDicho(id);
    } else if (id.startsWith("vp:")) {
      void apuntarDicho(id);
      valorarResueltos.add(id.slice(3));
      void medirEvento("valoracion_pedida", "Valoración del pedido: pedida", { metadata: { origen: "blue" } });
    } else if (id.startsWith("eg:")) {
      void apuntarDicho(id);
      void medirEvento("envio_gratis_aviso", "Envío gratis regalado: aviso de Blue mostrado");
    } else if (id.startsWith("ap:")) {
      const [, productId, precio] = id.split(":");
      void apuntarDicho(id);
      void marcarBajadaAvisada(productId, Number(precio));
      void medirEvento("aviso_precio_mostrado", "Blue: bajada de precio mostrada", { metadata: { productId } });
    }
  }, [bocadillo]);

  // Oferta de instalar la tienda como app: un mensaje de Blue, una vez cada 7 días como mucho,
  // cuando ya lleva un rato en pantalla, no está hablando de otra cosa y la persona ya
  // contestó el aviso de cookies. Siempre queda el botón en el panel de Blue.
  useEffect(() => {
    if (!modoInst || !enPantalla || enAdmin || guiaAbierta || pathname.startsWith("/checkout")) return;
    let vivo = true;
    let t: ReturnType<typeof setTimeout>;
    // Si Blue está diciendo otra cosa, espera 15 s y lo intenta de nuevo (hasta 8 veces).
    const intentar = async (veces: number) => {
      try {
        if (!vivo || (await leerConsentimientoAnalitica()) === null) return;
        const visto = Number((await AsyncStorage.getItem(INSTALAR_KEY)) ?? 0);
        if (!vivo || (visto && Date.now() - visto < INSTALAR_ESPERA_MS)) return;
        if (bocadilloRef.current) {
          if (veces < 8) t = setTimeout(() => intentar(veces + 1), 15000);
          return;
        }
        await AsyncStorage.setItem(INSTALAR_KEY, String(Date.now()));
        if (!vivo) return;
        medirEvento("instalar_oferta", "Instalar app: oferta");
        decir({
          id: "instalar",
          texto: "Instala la tienda en tu móvil y ábrela con un toque desde la pantalla de inicio.",
          accion: "instalar",
        });
      } catch {
        // sin oferta si falla
      }
    };
    t = setTimeout(() => intentar(0), 40000);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [modoInst, enPantalla, enAdmin, guiaAbierta, pathname, decir]);

  // Pedidos y reparaciones olvidados (48 h sin cambios): Blue se lo dice al dueño UNA vez al día, dentro de
  // Administración (la cola de mensajes respeta los 15 s de rigor), y el aviso sigue en su panel hasta que se muevan.
  useEffect(() => {
    if (!enAdmin || !isAdmin || !enPantalla || guiaAbierta) return;
    const total = olvidados.pedidos + olvidados.reparaciones;
    if (!total) return;
    let vivo = true;
    (async () => {
      const hoy = new Date().toISOString().slice(0, 10);
      try {
        if ((await AsyncStorage.getItem(OLVIDADOS_DICHO_KEY)) === hoy || !vivo) return;
        await AsyncStorage.setItem(OLVIDADOS_DICHO_KEY, hoy);
      } catch {
        // sin almacenamiento: se dice igual
      }
      if (!vivo) return;
      decir({
        panel: true,
        id: "olvidados",
        texto: `${textoOlvidados(olvidados)} ${total === 1 ? "lleva" : "llevan"} más de 48 h sin cambios: échales un vistazo.`,
        accion: "ruta",
        ruta: olvidados.pedidos > 0 ? "/admin/pedidos" : "/admin/services",
      });
    })();
    return () => {
      vivo = false;
    };
  }, [olvidados, enAdmin, isAdmin, enPantalla, guiaAbierta, decir]);

  // Blue propone información de la tienda al dueño, dentro del panel de administración: a los
  // 25 s de entrar y después cada 10 min mira si toca (de 9 a 21 h, hueco de 45 min, hasta 8 al
  // día). Solo propone temas sin respuesta, sin «No aplica» y sin «Ahora no» de hoy.
  useEffect(() => {
    if (!enAdmin || !isAdmin || !enPantalla || guiaAbierta) return;
    let vivo = true;
    const intentar = async () => {
      try {
        const hora = new Date().getHours();
        if (!vivo || hora < 9 || hora >= 21 || bocadilloRef.current || propuestaAbiertaRef.current) return;
        const estado = await leerEstadoProp();
        if (estado.n >= PROP_MAX_DIA || Date.now() - estado.ultima < PROP_HUECO_MS) return;
        const respondidos = await temasRespondidos();
        const siguiente = TEMAS_CONOCIMIENTO.find(
          (t) => !respondidos.has(t.tema) && !estado.hoyNo.includes(t.tema) && !estado.descartados.includes(t.tema)
        );
        if (!vivo || !siguiente || bocadilloRef.current) return;
        await guardarEstadoProp({ ...estado, n: estado.n + 1, ultima: Date.now() });
        decir({
          panel: true,
          id: `prop:${siguiente.tema}`,
          texto: `${siguiente.tema}: ¿me lo cuentas para responder mejor a tus clientes?`,
          accion: "conocimiento",
          tema: siguiente.tema,
        });
      } catch {
        // sin propuesta si falla
      }
    };
    const primera = setTimeout(intentar, 25000);
    const cada = setInterval(intentar, 10 * 60 * 1000);
    return () => {
      vivo = false;
      clearTimeout(primera);
      clearInterval(cada);
    };
  }, [enAdmin, isAdmin, enPantalla, guiaAbierta, decir]);

  // Entrada (una sola vez, la primera vez que se ve): rebote de escala y saludo
  // moviéndose de lado a lado.
  useEffect(() => {
    if (!enPantalla || visorFotos || entradaHechaRef.current) return;
    entradaHechaRef.current = true;
    entrada.setValue(0);
    saludo.setValue(0);
    Animated.spring(entrada, { toValue: 1, friction: 4.2, tension: 70, useNativeDriver: USA_NATIVO }).start();
    const paso = (toValue: number, duration: number) =>
      Animated.timing(saludo, { toValue, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: USA_NATIVO });
    Animated.sequence([Animated.delay(420), paso(1, 130), paso(-1, 180), paso(0.7, 160), paso(-0.4, 140), paso(0, 130)]).start();
    setSaludando(true);
  }, [enPantalla, visorFotos, entrada, saludo]);

  // Mini bocadillo "¡Hola! Soy Blue": entra tras el rebote y se va solo.
  useEffect(() => {
    if (!saludando) return;
    chipAnim.setValue(0);
    Animated.timing(chipAnim, {
      toValue: 1,
      duration: 280,
      delay: 360,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: USA_NATIVO,
    }).start();
    const timer = setTimeout(() => {
      Animated.timing(chipAnim, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: USA_NATIVO }).start(() =>
        setSaludando(false)
      );
    }, SALUDO_MS);
    return () => clearTimeout(timer);
  }, [saludando, chipAnim]);

  // Con el panel abierto, un bocadillo o el saludo a la vista no se oculta (lo lee
  // el listener de scroll, que se registra una sola vez).
  // Un mensaje de Blue ya NO impide esconderlo: va pegado a Blue y se esconde con él al bajar el
  // scroll (y vuelve con él cuando la pantalla se queda quieta).
  const bocadilloVisible = aparecido && !!bocadillo;
  const noOcultarRef = useRef(false);
  noOcultarRef.current = panelOpen || saludando;

  const ocultoScrollRef = useRef(false);
  const ponerOcultoScroll = useCallback((oculto: boolean) => {
    if (ocultoScrollRef.current === oculto) return;
    ocultoScrollRef.current = oculto;
    setOcultoScroll(oculto);
  }, []);

  // Scroll de CUALQUIER contenedor (los ScrollView de la web son divs con su propio
  // scroll, que no burbujea: por eso capture). Se compara el scrollTop de ese mismo
  // elemento con el anterior: bajar ≥ 12 px oculta, subir ≥ 12 px muestra.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || !aparecido) return;
    // Último scrollTop de cada contenedor (WeakMap: no retiene los que se desmontan).
    const ultimos = new WeakMap<object, number>();
    // Pantalla parada: pasados PARADA_MS sin ningún movimiento de scroll, Blue vuelve a verse.
    let parada: ReturnType<typeof setTimeout> | null = null;
    const alHacerScroll = (ev: Event) => {
      if (parada) clearTimeout(parada);
      parada = setTimeout(() => {
        parada = null;
        ponerOcultoScroll(false);
      }, PARADA_MS);
      const t = ev.target;
      const elemento = t instanceof Element && t !== document.documentElement && t !== document.body ? t : null;
      const clave: object = elemento ?? document;
      const y = elemento ? elemento.scrollTop : window.scrollY || document.documentElement.scrollTop || 0;
      const previo = ultimos.get(clave);
      if (previo === undefined) {
        ultimos.set(clave, y);
        return;
      }
      // Scroll horizontal (carruseles): el scrollTop no cambia, no cuenta.
      if (y === previo) return;
      if (y < SCROLL_ARRIBA) {
        ultimos.set(clave, y);
        ponerOcultoScroll(false);
        return;
      }
      const delta = y - previo;
      if (Math.abs(delta) < SCROLL_UMBRAL) return;
      ultimos.set(clave, y);
      if (delta < 0) ponerOcultoScroll(false);
      else if (!noOcultarRef.current) ponerOcultoScroll(true);
    };
    document.addEventListener("scroll", alHacerScroll, { capture: true, passive: true });
    return () => {
      if (parada) clearTimeout(parada);
      document.removeEventListener("scroll", alHacerScroll, { capture: true });
    };
  }, [aparecido, ponerOcultoScroll]);

  // Al cambiar de pantalla vuelve a verse; también si sale un bocadillo.
  useEffect(() => {
    ponerOcultoScroll(false);
  }, [pathname, ponerOcultoScroll]);
  useEffect(() => {
    if (bocadilloVisible) ponerOcultoScroll(false);
  }, [bocadilloVisible, ponerOcultoScroll]);

  // Ocultar: se desliza hacia su borde y se desvanece; al volver, con un leve rebote. Con el visor de fotos abierto,
  // siempre (la foto ampliada se ve entera).
  const oculto = visorFotos || (algoDebajo && !panelOpen && !guiaAbierta) || (ocultoScroll && !panelOpen && !saludando);

  // El mensaje a la vista se cierra solo a los 12 s (MENSAJE_VISIBLE_MS); si Blue se esconde, la cuenta vuelve a empezar
  // cuando se vuelve a ver.
  useEffect(() => {
    if (!bocadillo || oculto || panelOpen || !enPantalla) return;
    const b = bocadillo;
    const t = setTimeout(() => {
      setBocadillo((actual) => (actual === b ? null : actual));
      contarMensaje(b, "se cierra solo");
    }, MENSAJE_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [bocadillo, oculto, panelOpen, enPantalla]);
  useEffect(() => {
    Animated.timing(ocultar, {
      toValue: oculto ? 1 : 0,
      duration: oculto ? 220 : 280,
      easing: oculto ? Easing.in(Easing.cubic) : Easing.out(Easing.back(1.3)),
      useNativeDriver: USA_NATIVO,
    }).start();
  }, [oculto, ocultar]);

  // --- arrastrar / tocar --------------------------------------------------------
  const totalRef = useRef(0);
  totalRef.current = totalCount;

  const openPanel = useCallback((tab?: "blue" | "avisos") => {
    setBocadillo(null);
    setSaludando(false);
    // Si hay notificaciones pendientes, se abre directamente en esa pestaña.
    setPestana(tab ?? (totalRef.current > 0 ? "avisos" : "blue"));
    setPanelOpen(true);
    refreshChats();
    refreshLikes();
    refreshNovedades();
    refreshNoticiasNuevas();
    refreshAvisosTienda();
  }, [refreshChats, refreshLikes, refreshNovedades, refreshNoticiasNuevas, refreshAvisosTienda]);

  const openPanelRef = useRef(openPanel);
  openPanelRef.current = openPanel;

  // Blue va fijo arriba a la derecha (ya no se aparta solo): solo se recoloca si su sitio fijo ha cambiado (en Inicio,
  // bajo el buscador, si el buscador cambia de altura o se baja) y se esconde mientras haya un botón debajo de su sitio
  // (al desplazar la página) o la lista de resultados del buscador esté abierta encima. Se mira al cambiar de pantalla,
  // al tocar algo, al dejar de desplazarse y cada pocos segundos (solo web).
  const enPantallaRef = useRef(false);
  enPantallaRef.current = enPantalla && !oculto && !panelOpen && !guiaAbierta;
  const comprobarSitio = useCallback(() => {
    if (Platform.OS !== "web") return;
    const xy = posicionFija(pantallaRef.current === "/");
    setAlgoDebajo(algoDebajoDeBlue(xy));
    if (!enPantallaRef.current) return;
    if (Math.abs(xy.x - posRef.current.x) > 1 || Math.abs(xy.y - posRef.current.y) > 1) moverA(SITIO_FIJO);
  }, [moverA]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const trasScroll = () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => {
        espera = null;
        comprobarSitio();
      }, APARTARSE_TRAS_SCROLL_MS);
    };
    const cada = setInterval(() => {
      if (document.visibilityState !== "hidden") comprobarSitio();
    }, APARTARSE_CADA_MS);
    document.addEventListener("scroll", trasScroll, { capture: true, passive: true });
    window.addEventListener("resize", trasScroll);
    // En cuanto algo se toca (se abre un desplegable, un aviso…) o aparece contenido nuevo,
    // mira otra vez sin esperar a la vuelta de cada 1,2 s.
    document.addEventListener("click", trasScroll, { capture: true, passive: true });
    let observador: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined" && document.body) {
      observador = new MutationObserver(() => {
        if (!espera) espera = setTimeout(() => {
          espera = null;
          comprobarSitio();
        }, 300);
      });
      observador.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      if (espera) clearTimeout(espera);
      clearInterval(cada);
      observador?.disconnect();
      document.removeEventListener("scroll", trasScroll, { capture: true });
      document.removeEventListener("click", trasScroll, { capture: true });
      window.removeEventListener("resize", trasScroll);
    };
  }, [comprobarSitio]);

  // Al cambiar de pantalla, cuando el contenido nuevo ya está pintado.
  useEffect(() => {
    const t = setTimeout(comprobarSitio, 900);
    return () => clearTimeout(t);
  }, [pathname, comprobarSitio]);

  // Nada más aparecer (y otra vez al acabar el saludo): si cae encima de un botón, por ejemplo del «Aceptar» del aviso
  // de cookies, se esconde ya, sin esperar a la siguiente vuelta.
  useEffect(() => {
    if (!enPantalla) return;
    // Antes de que se vea (entra transparente): ya en su sitio fijo de esta pantalla, sin muelle.
    const xy = posicionFija(pantallaRef.current === "/");
    posRef.current = xy;
    pan.setValue(xy);
    const t1 = setTimeout(comprobarSitio, 150);
    const t2 = setTimeout(comprobarSitio, SALUDO_MS + 700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // (también al pasar de una pantalla con Blue a otra, p. ej. de Inicio a una ficha: va a su sitio sin deslizarse)
  }, [enPantalla, pathname, comprobarSitio, pan]);

  // --- guía de bienvenida -------------------------------------------------------------
  // A los 15 s de entrar, una sola vez por dispositivo y solo a quien no tiene sesión (es
  // nuevo). Solo se ofrece sola en Inicio: quien llega a una ficha, al catálogo, a un chat, al pago o al panel
  // (p. ej. desde un enlace compartido) no es interrumpido ni llevado a otra pantalla; se espera a que llegue a Inicio.
  const sitioSinGuia = pathname !== "/";
  // Pantalla con mini-guía («Guía rápida» en el panel), si la tiene.
  const seccionGuiaActual = seccionDeGuia(pathname);
  const sitioSinGuiaRef = useRef(sitioSinGuia);
  sitioSinGuiaRef.current = sitioSinGuia;

  useEffect(() => {
    const yaPasado = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : 0;
    const t = setTimeout(async () => {
      try {
        if ((await AsyncStorage.getItem(GUIA_VISTA_KEY)) === "1") return;
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) return;
      } catch {
        return;
      }
      if (sitioSinGuiaRef.current) guiaPendienteRef.current = true;
      else abrirGuia();
    }, Math.max(0, GUIA_MS - yaPasado));
    return () => clearTimeout(t);
  }, [abrirGuia]);

  // Con «Completa tu perfil» abierta (components/PerfilPublico.tsx) Blue se esconde y la guía espera.
  const perfilObligatorio = usePerfilObligatorioVisible();
  // Con «Mi perfil» desplegado en Mi cuenta (/perfil), Blue no aparece (dueño, 2026-11-03).
  const miPerfilAbierto = useMiPerfilAbierto() && pathname === "/perfil";
  useEffect(() => {
    if (guiaPendienteRef.current && !sitioSinGuia && !perfilObligatorio) {
      guiaPendienteRef.current = false;
      abrirGuia();
    }
  }, [sitioSinGuia, abrirGuia, perfilObligatorio]);

  // volver = true (Saltar, «Ahora no», atrás del móvil): se vuelve a la pantalla donde estaba la persona al abrirse la
  // guía. Con una acción (Crear cuenta, Instalar…) no: esa acción lleva a otro sitio.
  const cerrarGuia = useCallback((volver?: boolean) => {
    setGuiaAbierta(false);
    setGuiaSenalaBlue(false);
    // Una mini-guía no cuenta como «la guía de bienvenida vista»: quien aún no la ha visto la sigue recibiendo.
    if (!guiaMiniRef.current) AsyncStorage.setItem(GUIA_VISTA_KEY, "1").catch(() => {});
    const origen = guiaOrigenRef.current;
    guiaOrigenRef.current = null;
    if (volver === true && origen && origen !== pathnameActualRef.current) router.navigate(origen as Href);
  }, []);

  // Con la guía abierta Blue tiene que verse en su sitio (no escondido por el scroll).
  useEffect(() => {
    if (guiaAbierta) ponerOcultoScroll(false);
  }, [guiaAbierta, ponerOcultoScroll]);

  // --- Blue en momentos clave (mejora 12): consejos de los primeros momentos ------------------------------------------
  const consejosOff = useConsejosApagados();
  // Primer «Comparar»: se ha añadido algo desde que arrancó la tienda (lo ya guardado no cuenta). Se cuenta en el
  // comparador, no aquí, porque Blue se descarga aparte y puede montarse después del primer toque.
  const { lista: listaComparar, leido: compararLeido } = useComparar();
  const altoBarraComparar = useAlturaBarraComparar();
  const anadidosVistosRef = useRef(0);
  const [momentoComparar, setMomentoComparar] = useState(false);
  useEffect(() => {
    if (!compararLeido) return;
    const anadidos = anadidosCompararDesdeArranque();
    if (anadidos > anadidosVistosRef.current) {
      anadidosVistosRef.current = anadidos;
      setMomentoComparar(true);
    }
  }, [compararLeido, listaComparar.length]);
  // Con la guía abierta (o «Completa tu perfil», o Administración) no hay consejos; el que estuviera a la vista se va.
  const sinConsejos = consejosOff || enAdmin || guiaAbierta || perfilObligatorio || miPerfilAbierto;
  useEffect(() => {
    if (!sinConsejos) return;
    setConsejo(null);
    colaMensajesRef.current = colaMensajesRef.current.filter((b) => !b.consejo);
  }, [sinConsejos]);
  const enCestaConArticulos = pathname.startsWith("/cesta") && reservas.length > 0;
  useEffect(() => {
    if (sinConsejos || !aparecido || consejo) return;
    const candidatos: MomentoBlue[] = [];
    if (enCestaConArticulos) candidatos.push("cesta");
    if (momentoComparar && momentoEnPantalla("comparar", pathname)) candidatos.push("comparar");
    // El del catálogo («Encuentra lo tuyo») ya no sale (dueño, 2026-11-19: «no me gusta»).
    if (pathname.startsWith("/producto/")) candidatos.push("ficha");
    if (cuentaNueva && isLoggedIn && momentoEnPantalla("cuenta", pathname)) candidatos.push("cuenta");
    const pendientes = candidatos.filter((m) => !yaDicho.has(`consejo:${m}`));
    if (!pendientes.length) return;
    let vivo = true;
    (async () => {
      // Con el aviso de cookies sin contestar Blue no habla (lo taparía).
      if ((await leerConsentimientoAnalitica()) === null || !vivo || (await leerConsejosApagados())) return;
      const dichos = await cargarDichos();
      if (!vivo) return;
      for (const m of pendientes) if (dichos.has(`consejo:${m}`)) yaDicho.add(`consejo:${m}`);
      const m = pendientes.find((x) => !dichos.has(`consejo:${x}`));
      if (!m) {
        if (momentoComparar && pendientes.includes("comparar")) setMomentoComparar(false);
        return;
      }
      const pago = m === "cesta" ? await consultarPagoOnline() : null;
      if (!vivo) return;
      const detalle = contenidoConsejo(m, pago);
      decir({ id: `consejo:${m}`, texto: detalle.titulo, consejo: m, trasAccion: m === "comparar", detalle });
    })();
    return () => {
      vivo = false;
    };
  }, [sinConsejos, aparecido, consejo, enCestaConArticulos, momentoComparar, pathname, cuentaNueva, isLoggedIn, decir]);
  // Al enseñarse queda dicho en el dispositivo (no vuelve a salir) y se mide (solo el momento).
  useEffect(() => {
    if (!consejo?.consejo) return;
    yaDicho.add(consejo.id);
    void apuntarDicho(consejo.id);
    void medirEvento("consejo_mostrado", "Blue: consejo mostrado", { metadata: { momento: consejo.consejo } });
    if (consejo.consejo === "comparar") setMomentoComparar(false);
  }, [consejo]);
  const cerrarConsejo = useCallback((como: "seguido" | "cerrado" | "solo") => {
    const c = consejoRef.current;
    consejoRef.current = null;
    setConsejo(null);
    if (c?.consejo && como !== "solo") {
      void medirEvento(como === "seguido" ? "consejo_seguido" : "consejo_cerrado", como === "seguido" ? "Blue: consejo seguido" : "Blue: consejo cerrado", {
        metadata: { momento: c.consejo },
      });
    }
    // Lo que esperaba turno puede salir ya (con los 15 s entre mensajes de siempre).
    setTimeout(() => atenderColaRef.current(), 0);
    return c;
  }, []);
  const seguirConsejo = useCallback(() => {
    const c = cerrarConsejo("seguido");
    if (c?.detalle?.accion) router.push(c.detalle.accion.ruta as Href);
  }, [cerrarConsejo]);
  const cerrarConsejoX = useCallback(() => void cerrarConsejo("cerrado"), [cerrarConsejo]);
  const consejoSolo = useCallback(() => void cerrarConsejo("solo"), [cerrarConsejo]);
  const apagarConsejosAqui = useCallback(() => {
    cambiarConsejos(true, "consejo");
    colaMensajesRef.current = colaMensajesRef.current.filter((b) => !b.consejo);
    void cerrarConsejo("solo");
  }, [cerrarConsejo]);

  // El toque lo gestiona un Pressable (clic normal, fiable en Safari del iPhone). Blue ya no se arrastra: va fijo arriba
  // a la derecha (dueño, 2026-11-04).

  // --- acciones -----------------------------------------------------------------
  // Tocar un mensaje lleva directamente a lo que dice.
  const alTocarBocadillo = useCallback(() => {
    const b = bocadillo;
    setBocadillo(null);
    if (!b) return;
    contarMensaje(b, "tocado");
    if (b.accion === "chat" || b.accion === "ruta") router.push((b.ruta ?? "/blue-ia") as Href);
    else if (b.accion === "vender") {
      marcarOrigenVender("blue");
      abrirVender();
    } else if (b.accion === "instalar") instalarApp();
    else if (b.accion === "conocimiento") {
      const t = TEMAS_CONOCIMIENTO.find((x) => x.tema === b.tema);
      if (t) setPropuesta(t);
    } else openPanel("avisos");
  }, [bocadillo, openPanel, abrirVender, instalarApp]);

  const ir = useCallback((href: string) => {
    setPanelOpen(false);
    router.push(href as Href);
  }, []);

  const handleDismissLikes = useCallback(async () => {
    const removeIds = likedUnavailable;
    setLikedUnavailable([]);
    try {
      const current = await getLikedProductIds();
      await AsyncStorage.setItem(LIKED_PRODUCTS_KEY, JSON.stringify(current.filter((id) => !removeIds.includes(id))));
    } catch {
      // como mucho se vuelve a avisar
    }
  }, [likedUnavailable]);

  // Guarda en la cuenta (si hay sesión) los ajustes de avisos de artículos nuevos. true si la cuenta lo ha guardado.
  const guardarPreferenciasNovedades = useCallback(async (campos: { avisos_novedades?: boolean; novedades_vistas_hasta?: string }) => {
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return false;
      const { error } = await supabase
        .from("preferencias_usuario")
        .upsert({ user_id: user.id, ...campos, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      return !error;
    } catch {
      return false;
    }
  }, []);

  // El interruptor solo sale con sesión (sin ella, «Crear cuenta gratis»): se guarda en la cuenta, no en el dispositivo.
  // Si la cuenta no lo guarda, vuelve a como estaba.
  const cambiarAvisosNovedades = useCallback(
    async (activar: boolean) => {
      const ahora = new Date().toISOString();
      setAvisosNovedades(activar);
      setNovedadesTienda(0);
      // Al activarlos se empieza a contar desde ahora (sin avisar de lo que ya había).
      if (activar) AsyncStorage.setItem(NOVEDADES_VISTAS_KEY, ahora).catch(() => {});
      const guardado = await guardarPreferenciasNovedades(activar ? { avisos_novedades: true, novedades_vistas_hasta: ahora } : { avisos_novedades: false });
      if (!guardado) setAvisosNovedades(!activar);
    },
    [guardarPreferenciasNovedades]
  );

  // «Crear cuenta gratis» (sin sesión): los avisos de bajadas de precio y artículos nuevos son solo con cuenta. Se cuenta
  // el toque (y, si crea la cuenta, Administración → Analítica lo ve) y al entrar con la cuenta se vuelve aquí.
  const crearCuentaPorAvisos = useCallback(() => {
    void medirEvento("blue_cuenta_avisos", "Blue: crear cuenta por avisos", { metadata: { pantalla: pathnameActualRef.current || "/" } });
    marcarOrigenRegistro("blue_avisos");
    const ruta = pathnameActualRef.current;
    if (ruta && ruta.startsWith("/") && !ruta.startsWith("/perfil")) {
      AsyncStorage.setItem(VOLVER_TRAS_ACCESO_KEY, JSON.stringify({ ruta, hasta: Date.now() + 30 * 60_000 })).catch(() => {});
    }
    setPanelOpen(false);
    router.push("/perfil?acceso=registro" as Href);
  }, []);

  // «Activa los avisos de noticias» (pestaña «Noticias y avisos», dueño 2026-11-04: que funcione con un toque): se activan
  // aquí mismo, como con la campana de Noticias Gaming (app/(tabs)/chat-global.tsx): en el dispositivo y, con sesión, en
  // la cuenta (preferencias_usuario). Se cuenta desde ahora (sin avisar de las noticias que ya había). Si la cuenta no
  // lo guarda, no se da por activado y se dice; sin la tabla (migración sin aplicar) queda en el dispositivo, como allí.
  const [activandoNoticias, setActivandoNoticias] = useState(false);
  const [noticiasRecienActivadas, setNoticiasRecienActivadas] = useState(false);
  const [errorAvisosNoticias, setErrorAvisosNoticias] = useState<string | null>(null);
  const activarAvisosNoticias = useCallback(async () => {
    if (activandoNoticias) return;
    setActivandoNoticias(true);
    setErrorAvisosNoticias(null);
    const ahora = new Date().toISOString();
    let ok = true;
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (user) {
        const { error } = await supabase
          .from("preferencias_usuario")
          .upsert({ user_id: user.id, avisos_noticias: true, noticias_vistas_hasta: ahora, updated_at: ahora }, { onConflict: "user_id" });
        if (error && !/^(PGRST205|42P01)$/.test(String(error.code ?? ""))) ok = false;
      }
    } catch {
      ok = false;
    }
    if (ok) {
      try {
        await AsyncStorage.setItem(NOTICIAS_AVISOS_KEY, "1");
        await AsyncStorage.setItem(NOTICIAS_VISTAS_KEY, ahora);
      } catch {
        // sin almacenamiento local: queda en la cuenta
      }
      setAvisosNoticias(true);
      setNoticiasNuevas(0);
      setNoticiaNueva(null);
      setNoticiasRecienActivadas(true);
      void medirEvento("avisos_noticias_activados", "Blue: avisos de noticias activados", { metadata: { desde: "panel de Blue" } });
    } else {
      setErrorAvisosNoticias("No se han podido activar. Inténtalo de nuevo.");
    }
    setActivandoNoticias(false);
  }, [activandoNoticias]);
  // La confirmación («Avisos de noticias activados») se ve mientras el panel sigue abierto.
  useEffect(() => {
    if (!panelOpen) {
      setNoticiasRecienActivadas(false);
      setErrorAvisosNoticias(null);
    }
  }, [panelOpen]);

  const verNovedades = useCallback(async () => {
    const ahora = new Date().toISOString();
    setNovedadesTienda(0);
    AsyncStorage.setItem(NOVEDADES_VISTAS_KEY, ahora).catch(() => {});
    guardarPreferenciasNovedades({ novedades_vistas_hasta: ahora });
    ir("/");
  }, [guardarPreferenciasNovedades, ir]);

  const verLlegada = useCallback(
    async (l: Llegada) => {
      setLlegadas((prev) => prev.filter((x) => x.aviso.id !== l.aviso.id));
      if (l.reposicion) {
        // «Avisarme cuando haya otro»: queda avisado (en la cuenta) y se mide el toque (sin datos personales).
        void marcarReposicionAvisada(l.aviso.id);
        void medirEvento("aviso_reposicion_tocado", "Blue: aviso de reposición tocado", { metadata: { productos: l.productos.length } });
        ir(l.productos.length === 1 ? `/producto/${l.productos[0].id}` : `/catalogo?query=${encodeURIComponent(l.aviso.texto)}`);
        return;
      }
      supabase
        .from("avisos_busqueda")
        .update({ visto_hasta: new Date().toISOString() })
        .eq("id", l.aviso.id)
        .then(() => {}, () => {});
      ir(l.productos.length === 1 ? `/producto/${l.productos[0].id}` : `/catalogo?query=${encodeURIComponent(l.aviso.texto)}`);
    },
    [ir]
  );

  const verBajada = useCallback(
    async (b: Bajada) => {
      setBajadas((prev) => prev.filter((x) => x.id !== b.id));
      if (b.seguido) {
        // «Avísame si baja de precio»: esta bajada ya está avisada (en la cuenta) y se mide el toque.
        void marcarBajadaAvisada(b.id, b.ahora);
        void medirEvento("aviso_precio_tocado", "Blue: bajada de precio tocada", { metadata: { productId: b.id, donde: "panel" } });
        ir(`/producto/${b.id}`);
        return;
      }
      const vistos = await leerJsonLocal<Record<string, number>>(PRECIOS_VISTOS_KEY, {});
      vistos[b.id] = b.ahora;
      AsyncStorage.setItem(PRECIOS_VISTOS_KEY, JSON.stringify(vistos)).catch(() => {});
      ir(`/producto/${b.id}`);
    },
    [ir]
  );

  const anadirAviso = useCallback(async () => {
    const r = await crearAvisoBusqueda(textoAviso);
    if (r === "ok") {
      setTextoAviso("");
      setMsgAviso("Hecho: te avisaremos en cuanto llegue.");
    } else if (r === "limite") {
      setMsgAviso("Ya tienes 10 avisos: quita alguno para añadir otro.");
    } else if (r === "sin_sesion") {
      setMsgAviso("Inicia sesión para crear avisos.");
    } else {
      setMsgAviso("Escribe al menos 2 letras de lo que buscas.");
    }
  }, [textoAviso]);

  const quitarAviso = useCallback(async (id: string) => {
    setAvisosBusqueda((prev) => prev.filter((a) => a.id !== id));
    setLlegadas((prev) => prev.filter((l) => l.aviso.id !== id));
    try {
      await supabase.from("avisos_busqueda").delete().eq("id", id);
    } catch {
      // se volverá a ver al recargar
    }
  }, []);

  // Antes de los 10 s (o en un chat) Blue no existe en pantalla.
  // Tampoco en el panel de administración (petición del dueño): allí no hace falta.
  // El consejo de un primer momento va en su propia tarjeta: también donde Blue no se ve (la cesta, el catálogo).
  const capaConsejo =
    consejo?.detalle && !sinConsejos ? (
      <ConsejoBlue
        detalle={consejo.detalle}
        momento={consejo.consejo ?? "ficha"}
        oculto={visorFotos || panelOpen}
        alturaBarra={altoBarraComparar}
        onSeguir={seguirConsejo}
        onCerrar={cerrarConsejoX}
        onSolo={consejoSolo}
        onApagar={apagarConsejosAqui}
      />
    ) : null;
  if (avisoSelector && enForo && !enAdmin && !guiaAbierta) return <AvisoSelector onCerrar={() => setAvisoSelector(false)} />;
  // Con la guía abierta se sigue montando aunque la guía pase por una pantalla de chat (Foro,
  // Blue IA): Blue no se ve ahí (sigue escondido), pero la guía no puede desaparecer.
  // En el panel de administración Blue solo aparece para el dueño (propone información de la
  // tienda); a cualquier otra persona no se le monta nunca allí.
  if (!ready || (sinBlue && !guiaAbierta) || (enAdmin && !isAdmin) || !aparecido || ((perfilObligatorio || miPerfilAbierto) && !guiaAbierta)) return capaConsejo;

  const derecha = sitio.lado === "r";
  // Los mensajes salen DEBAJO de Blue, pegados a su borde derecho y creciendo hacia abajo, con el ancho que quepa.
  // A su izquierda (como antes) tapaban la cabecera de las fichas, con «Volver atrás», ahora que Blue va fijo en ella.
  // Alargado (más ancho que alto): pocas líneas, sin título ni botón aparte.
  const anchoMensaje = Math.max(170, Math.min(330, Dimensions.get("window").width - EDGE_INSET * 2));
  const ladoMensaje = { right: 0, top: BLUE_SIZE + 6 };
  const pistaAccion =
    bocadillo?.accion === "chat"
      ? { icono: "chatbubble-ellipses-outline" as const, texto: "Escribir ahora" }
      : bocadillo?.accion === "vender"
        ? { icono: "cash-outline" as const, texto: "Vender ahora" }
        : bocadillo?.accion === "ruta"
          ? { icono: "arrow-forward-circle-outline" as const, texto: "Ver" }
          : bocadillo?.accion === "instalar"
            ? { icono: "download-outline" as const, texto: "Instalar" }
            : bocadillo?.accion === "conocimiento"
              ? { icono: "create-outline" as const, texto: "Responder" }
              : null;

  // Capa visible: fundido de entrada × fundido al ocultarse, y deslizamiento
  // hacia su borde. Cuerpo: rebote de escala y giro del saludo.
  const opacidadCapa = Animated.multiply(
    entrada.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
    ocultar.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: "clamp" })
  );
  const deslizCapa = ocultar.interpolate({ inputRange: [0, 1], outputRange: [0, derecha ? DESLIZ_OCULTO : -DESLIZ_OCULTO] });
  const escalaCuerpo = entrada.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const giroSaludo = saludo.interpolate({ inputRange: [-1, 1], outputRange: ["-14deg", "14deg"] });

  return (
    <>
      {/* Capa del tamaño exacto de la pantalla que recorta: Blue y sus mensajes nunca se
          salen por un lado (en el iPhone eso ensanchaba toda la página).
          OJO: pointerEvents SIEMPRE como propiedad, nunca dentro de style. En la web,
          react-native-web descarta «box-none» en los estilos en línea y esta capa de pantalla
          completa se quedaba con todos los toques: la tienda parecía congelada al aparecer Blue.
          Durante la guía Blue no se pinta (no tapa su tarjeta), salvo en el paso que le señala. */}
      {guiaAbierta && !guiaSenalaBlue ? null : (
      <View
        pointerEvents="box-none"
        style={{
          position: (Platform.OS === "web" ? "fixed" : "absolute") as "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: "hidden",
          zIndex: 99999,
          elevation: 20,
        }}
      >
      <Animated.View
        nativeID={BLUE_DOM_ID}
        // Oculto por scroll o durante la guía: no recibe toques.
        pointerEvents={oculto || guiaAbierta ? "none" : "box-none"}
        style={{
          position: "absolute",
          zIndex: 99999,
          elevation: 20,
          width: BLUE_SIZE,
          height: BLUE_SIZE,
          transform: pan.getTranslateTransform(),
        }}
      >
        <Animated.View
          pointerEvents={oculto || guiaAbierta ? "none" : "box-none"}
          style={{
            width: BLUE_SIZE,
            height: BLUE_SIZE,
            opacity: opacidadCapa,
            transform: [{ translateX: deslizCapa }],
          }}
        >
          {/* Mensaje de Blue: a su lado, en cristal transparente que se lee bien. Al tocarlo
              lleva a lo que dice. */}
          {bocadillo && !!bocadillo.panel === enAdmin ? (
            <Animated.View
              nativeID={BLUE_MENSAJE_DOM_ID}
              style={{
                position: "absolute",
                width: anchoMensaje,
                ...ladoMensaje,
                opacity: bocAnim,
                transform: [{ scale: bocAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
              }}
            >
              <Pressable
                onPress={alTocarBocadillo}
                accessibilityRole="button"
                accessibilityHint={pistaAccion?.texto}
                style={({ pressed }) => [CRISTAL, { paddingVertical: 8, paddingLeft: 13, paddingRight: 30, opacity: pressed ? 0.85 : 1 }]}
              >
                {/* Todo en un solo párrafo: «Blue», el mensaje y lo que pasa al tocar. */}
                <Text numberOfLines={3} style={[TEXTO_CRISTAL, { fontWeight: "800", fontSize: 13, lineHeight: 17 }]}>
                  <Text style={{ color: COLORS.accentDark, fontWeight: "900" }}>Blue · </Text>
                  {bocadillo.texto}
                  {pistaAccion ? <Text style={{ color: COLORS.accentDark, fontWeight: "900" }}>{`  ${pistaAccion.texto} ›`}</Text> : null}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (bocadillo) contarMensaje(bocadillo, "cerrado con la X");
                  setBocadillo(null);
                }}
                hitSlop={10}
                accessibilityLabel="Cerrar mensaje de Blue"
                style={{ position: "absolute", top: 7, right: 9 }}
              >
                <Ionicons name="close" size={16} color={COLORS.muted} />
              </Pressable>
            </Animated.View>
          ) : saludando ? (
            // Mini saludo al aparecer (al tocarlo, abre el panel de Blue). Escondido (visor de fotos), no se toca:
            // «box-none» deja tocables a sus hijos aunque la capa de Blue no lo sea.
            <Animated.View
              pointerEvents={oculto ? "none" : "box-none"}
              style={{
                position: "absolute",
                width: 176,
                alignItems: derecha ? "flex-end" : "flex-start",
                [derecha ? "right" : "left"]: BLUE_SIZE + 6,
                top: BLUE_SIZE / 2 - 18,
                opacity: chipAnim,
                transform: [{ scale: chipAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
              }}
            >
              <Pressable
                onPress={() => {
                  contarBlueAbierto(pantallaRef.current);
                  openPanel();
                }}
                accessibilityRole="button"
                accessibilityLabel="Hola, soy Blue. Abrir el asistente"
                style={[CRISTAL, { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 }]}
              >
                <Ionicons name="hand-left-outline" size={15} color={COLORS.accent} />
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}>
                  ¡Hola! Soy <Text style={{ color: COLORS.accentDark }}>Blue</Text>
                </Text>
              </Pressable>
            </Animated.View>
          ) : null}

          {/* Cuerpo de Blue: fijo arriba a la derecha; se toca para abrir su panel. */}
          <Animated.View style={{ width: BLUE_SIZE, height: BLUE_SIZE, transform: [{ scale: escalaCuerpo }, { rotate: giroSaludo }] }}>
            <View
              style={[
                { width: BLUE_SIZE, height: BLUE_SIZE, alignItems: "center", justifyContent: "center" },
                Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null,
              ]}
            >
              <Pressable
                onPress={() => {
                  contarBlueAbierto(pantallaRef.current);
                  openPanelRef.current();
                }}
                // En el paso de la guía que le señala, solo se mira: no abre el panel.
                disabled={guiaAbierta}
                accessibilityRole="button"
                accessibilityLabel="Abrir Blue, el asistente de la tienda"
                hitSlop={6}
                style={{ width: BLUE_SIZE, height: BLUE_SIZE, alignItems: "center", justifyContent: "center" }}
              >
                <MarcaAnimada cual="carga" ancho={BLUE_SIZE} tocable={false} />
              </Pressable>
              {totalCount > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 4,
                    minWidth: 20,
                    height: 20,
                    borderRadius: 10,
                    paddingHorizontal: 4,
                    backgroundColor: COLORS.danger,
                    borderWidth: 2,
                    borderColor: COLORS.bg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "900" }}>{badgeLabel}</Text>
                </View>
              ) : null}
            </View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
      </View>
      )}

      {/* El fondo se funde y solo la hoja sube y baja (useHojaAbajo, 2026-11-28). */}
      <Modal visible={animPanel.montada} transparent animationType="none" onRequestClose={() => setPanelOpen(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", alignItems: "center" }}>
          <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)" }, animPanel.fondo]}>
            <Pressable onPress={() => setPanelOpen(false)} accessibilityLabel="Cerrar" style={{ flex: 1 }} />
          </Animated.View>
          <Animated.View style={[{ width: "100%", alignItems: "center", maxHeight: "80%" }, animPanel.hoja]}>
          <Pressable
            onPress={() => {}}
            style={{
              width: "100%",
              maxWidth: 560,
              backgroundColor: COLORS.bg,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 18,
              paddingBottom: Platform.OS === "ios" ? 34 : 22,
              maxHeight: "100%",
              flexShrink: 1,
            }}
          >
            <Pressable onPress={() => setPanelOpen(false)} hitSlop={10} style={{ position: "absolute", top: 14, right: 16, zIndex: 2 }}>
              <Ionicons name="close" size={22} color={COLORS.muted} />
            </Pressable>

            <View style={{ alignItems: "center", gap: 6, marginBottom: 12 }}>
              <MarcaAnimada cual="tienda" ancho={pestana === "blue" ? 104 : 64} />
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>Blue</Text>
            </View>

            {/* Pestañas: Asistente · Noticias y avisos (las notificaciones y las noticias, en una sola) */}
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 14 }}>
              {(
                [
                  { key: "blue", label: "Asistente", icono: "sparkles-outline", n: 0 },
                  // En el panel, solo los avisos del panel (ver totalCount).
                  { key: "avisos", label: enAdmin ? "Avisos del panel" : "Noticias y avisos", icono: "notifications-outline", n: totalCount },
                ] as const
              ).map((p) => {
                const activa = pestana === p.key;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setPestana(p.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: activa }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      // 44 px de alto (regla del pulgar)
                      minHeight: 44,
                      paddingHorizontal: 10,
                      borderBottomWidth: 2,
                      borderBottomColor: activa ? COLORS.accent : "transparent",
                    }}
                  >
                    <Ionicons name={p.icono} size={15} color={activa ? COLORS.accentDark : COLORS.muted} />
                    <Text style={{ color: activa ? COLORS.accentDark : COLORS.muted, fontWeight: "900", fontSize: 13 }}>
                      {p.label}
                    </Text>
                    {p.n > 0 ? (
                      <View
                        style={{
                          minWidth: 18,
                          height: 18,
                          borderRadius: 9,
                          paddingHorizontal: 4,
                          backgroundColor: COLORS.danger,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "900" }}>{badgeLabel}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <ScrollView contentContainerStyle={{ gap: 14, alignItems: "center", paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
              {/* Dentro del Panel de control, el Asistente solo ofrece lo del panel (sin guías, «Vender» ni instalar). */}
              {pestana === "blue" && enAdmin ? (
                <>
                  <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>
                    Estás en el Panel de control: aquí solo te aviso de lo del panel.
                  </Text>
                  <View style={{ width: "100%", gap: 10, maxWidth: 380 }}>
                    <BotonPanel icono="grid-outline" texto="Ir al Panel de control" principal onPress={() => ir("/admin")} />
                    <BotonPanel icono="bulb-outline" texto="Lo que Blue sabe" onPress={() => ir("/admin/conocimiento")} />
                    <BotonPanel icono="storefront-outline" texto="Volver a la tienda" onPress={() => ir("/")} />
                  </View>
                </>
              ) : null}

              {pestana === "blue" && !enAdmin ? (
              <>
              <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>
                Tu asistente de VideojuegosZaragoza.com. ¿En qué te ayudo?
              </Text>

              <View style={{ width: "100%", gap: 10, maxWidth: 380 }}>
                {/* Un solo botón para hablar: primero conversa Blue IA y, desde ese chat, se pasa al equipo
                    («Hablar con el equipo», app/(tabs)/blue-ia.tsx). Antes eran dos botones que llevaban al mismo sitio. */}
                <BotonPanel icono="chatbubbles-outline" texto="Hablar con Blue IA o el equipo" principal onPress={() => ir("/blue-ia")} />
                <BotonPanel
                  icono="map-outline"
                  texto="Ver la guía de la tienda"
                  onPress={() => {
                    setPanelOpen(false);
                    abrirGuia();
                  }}
                />
                <BotonPanel
                  icono="cash-outline"
                  texto="Vender mi consola o dispositivo"
                  onPress={() => {
                    setPanelOpen(false);
                    marcarOrigenVender("blue");
                    abrirVender();
                  }}
                />
                {/* Solo si se puede instalar en este dispositivo y aún no está instalada. */}
                {modoInst ? <BotonPanel icono="download-outline" texto="Instalar la tienda como app" onPress={instalarApp} /> : null}
                {/* La cajita de ideas (components/VentanaValoracion.tsx): se cierra el panel y se abre encima de la tienda. */}
                <BotonPanel
                  icono="bulb-outline"
                  texto="Mejoras en la tienda"
                  onPress={() => {
                    setPanelOpen(false);
                    setMejorasAbierta(true);
                  }}
                />

                {/* Guías rápidas: una por pantalla, solo con lo de esa pantalla. Aquí (y no en la propia pantalla) porque
                    Blue no se ve en Vender, el Foro ni Blue IA. La de la pantalla donde estás va resaltada. */}
                <TituloSeccionBlue texto="Guías rápidas" />
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                  {(Object.keys(NOMBRE_SECCION_GUIA) as SeccionGuia[]).map((s) => {
                    const actual = s === seccionGuiaActual;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => {
                          setPanelOpen(false);
                          abrirMiniGuia(s);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Guía rápida: ${NOMBRE_SECCION_GUIA[s]}`}
                        style={({ pressed }) => ({
                          minHeight: 44,
                          paddingHorizontal: 16,
                          borderRadius: 999,
                          borderWidth: 1.5,
                          borderColor: COLORS.accent,
                          backgroundColor: actual ? COLORS.accentSoft : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <Text style={{ color: COLORS.accentDark, fontWeight: actual ? "900" : "800", fontSize: 14 }}>{NOMBRE_SECCION_GUIA[s]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              </>
              ) : null}

              {/* Dentro del Panel de control: solo los avisos del panel (los mismos tres que en la tienda ve el dueño, sin
                  los de la tienda ni las noticias ni «Mis avisos»). */}
              {pestana === "avisos" && enAdmin ? (
                <View nativeID="blue-avisos-panel" style={{ width: "100%", maxWidth: 460, gap: 2 }}>
                  <TituloSeccionBlue texto="Avisos del panel" />
                  {avisosPanel === 0 ? (
                    <FilaBlue icono="checkmark-circle-outline" titulo="Estás al día: no hay avisos del panel." />
                  ) : (
                    <>
                      {unreadChats > 0 ? (
                        <Aviso
                          icono="chatbubbles-outline"
                          titulo={unreadChats === 1 ? "Un cliente te ha escrito" : `${unreadChats} clientes te han escrito`}
                          accion="Ver mensajes"
                          onPress={() => ir("/admin/chats")}
                        />
                      ) : null}
                      {salidaPendiente > 0 ? (
                        <Aviso
                          icono="alert-circle-outline"
                          titulo={
                            salidaPendiente === 1
                              ? "Una venta de un artículo de VeoAura aún no se ha confirmado a VeoAura"
                              : `${salidaPendiente} ventas de artículos de VeoAura aún no se han confirmado a VeoAura`
                          }
                          accion="Ver escaparate"
                          onPress={() => ir("/admin/escaparate")}
                        />
                      ) : null}
                      {olvidados.pedidos + olvidados.reparaciones > 0 ? (
                        <Aviso
                          icono="hourglass-outline"
                          titulo={`${textoOlvidados(olvidados)} ${olvidados.pedidos + olvidados.reparaciones === 1 ? "lleva" : "llevan"} más de 48 h sin cambios`}
                          accion="Revisar"
                          onPress={() => ir(olvidados.pedidos > 0 ? "/admin/pedidos" : "/admin/services")}
                        />
                      ) : null}
                    </>
                  )}
                </View>
              ) : null}

              {/* «Noticias y avisos»: lo que ha pasado (avisos y noticias) y los ajustes de avisos, en una sola pestaña. */}
              {pestana === "avisos" && !enAdmin ? (
              <View style={{ width: "100%", maxWidth: 460, gap: 2 }}>
                {/* «Avisos» solo si hay alguno (dueño, 2026-11-04: sin «Estás al día» cuando no hay nada). */}
                {totalCount === 0 && reservasActivas.length === 0 ? null : (
                  <>
                    <TituloSeccionBlue texto="Avisos" />
                    {/* Novedades de tus pedidos y reparaciones (la etapa cambió desde la última vez que los viste). */}
                    {segAvisos.map((a) => (
                      <Aviso
                        icono={a.tipo === "pedido" ? "cube-outline" : "construct-outline"}
                        key={a.clave}
                        titulo={a.texto}
                        accion="Ver seguimiento"
                        onPress={() => {
                          if (a.tipo === "pedido") {
                            void medirEvento("pedido_aviso_estado_tocado", "Blue: aviso de estado del pedido tocado", { metadata: { estado: (a.clave.split(":")[2] ?? "").split("|")[0], donde: "panel" } });
                          }
                          ir("/perfil?tab=seguimientos");
                        }}
                      />
                    ))}
                    {/* Reservas de la cesta (15 minutos): las que vencen en 5 o menos avisan; las demás, solo informan. */}
                    {reservasActivas.map((r) => {
                      const falta = r.hasta - reloj;
                      const min = minutosQueQuedan(falta);
                      const urgente = falta <= RESERVA_AVISO_MS;
                      return (
                        <Aviso
                          icono="time-outline"
                          key={`${r.id}:${r.hasta}`}
                          titulo={urgente ? `Tu reserva de «${r.title}» vence en ${min} min` : `Reservado para ti: ${r.title}`}
                          detalle={urgente ? "Termina el pedido para no perderlo" : `Te quedan ${min} min`}
                          accion="Ir a la cesta"
                          onPress={() => ir("/cesta")}
                        />
                      );
                    })}
                    {unreadChats > 0 ? (
                      <Aviso
                        icono="chatbubbles-outline"
                        titulo={
                          isAdmin
                            ? unreadChats === 1
                              ? "Un cliente te ha escrito"
                              : `${unreadChats} clientes te han escrito`
                            : unreadChats === 1
                              ? "Tienes un mensaje nuevo"
                              : `Tienes ${unreadChats} mensajes nuevos`
                        }
                        accion="Ver mensajes"
                        onPress={() => ir(isAdmin ? "/admin/chats" : "/chat-global?tab=privados")}
                      />
                    ) : null}
                    {likedUnavailable.length > 0 ? (
                      <Aviso
                        icono="heart-dislike-outline"
                        titulo={
                          likedUnavailable.length === 1
                            ? "Un producto que te gustó ya no está disponible"
                            : `${likedUnavailable.length} productos que te gustaron ya no están disponibles`
                        }
                        accion="Quitar de favoritos"
                        onPress={handleDismissLikes}
                      />
                    ) : null}
                    {novedadesPending ? (
                      <Aviso icono="newspaper-outline" titulo="Hay novedades en el Foro" accion="Ver novedades" onPress={() => ir("/chat-global?tab=novedades")} />
                    ) : null}
                    {/* Noticia nueva: abre directamente esa noticia (con varias, la más reciente), no la lista (dueño,
                        2026-11-04); al verla se marcan como vistas y el aviso se va. */}
                    {noticiasNuevas > 0 ? (
                      <View nativeID="blue-aviso-noticia">
                        <Aviso
                          icono="megaphone-outline"
                          titulo={
                            noticiaNueva?.titulo
                              ? `Noticia nueva: ${noticiaNueva.titulo.length > 90 ? `${noticiaNueva.titulo.slice(0, 89).trimEnd()}…` : noticiaNueva.titulo}`
                              : noticiasNuevas === 1
                                ? "Hay 1 noticia nueva"
                                : `Hay ${noticiasNuevas} noticias nuevas`
                          }
                          detalle={noticiaNueva?.titulo && noticiasNuevas > 1 ? `Y ${noticiasNuevas - 1} más en Noticias Gaming` : undefined}
                          accion="Leer la noticia"
                          onPress={() => {
                            void medirEvento("blue_aviso_noticia", "Blue: noticia abierta desde el aviso", { metadata: { nuevas: noticiasNuevas } });
                            ir(noticiaNueva ? `/chat-global?noticia=${noticiaNueva.id}` : "/chat-global?tab=news");
                          }}
                        />
                      </View>
                    ) : null}
                    {isAdmin && salidaPendiente > 0 ? (
                      <Aviso
                        icono="alert-circle-outline"
                        titulo={
                          salidaPendiente === 1
                            ? "Una venta de un artículo de VeoAura aún no se ha confirmado a VeoAura"
                            : `${salidaPendiente} ventas de artículos de VeoAura aún no se han confirmado a VeoAura`
                        }
                        accion="Ver escaparate"
                        onPress={() => ir("/admin/escaparate")}
                      />
                    ) : null}
                    {isAdmin && olvidados.pedidos + olvidados.reparaciones > 0 ? (
                      <Aviso
                        icono="hourglass-outline"
                        titulo={`${textoOlvidados(olvidados)} ${olvidados.pedidos + olvidados.reparaciones === 1 ? "lleva" : "llevan"} más de 48 h sin cambios`}
                        accion="Revisar"
                        onPress={() => ir(olvidados.pedidos > 0 ? "/admin/pedidos" : "/admin/services")}
                      />
                    ) : null}
                    {novedadesTienda > 0 ? (
                      <Aviso
                        icono="bag-add-outline"
                        titulo={novedadesTienda === 1 ? "Ha llegado 1 artículo nuevo" : `Han llegado ${novedadesTienda} artículos nuevos`}
                        accion="Ver novedades"
                        onPress={verNovedades}
                      />
                    ) : null}
                    {llegadas.map((l) => (
                      <Aviso
                        icono={l.reposicion ? "notifications-outline" : "checkmark-done-outline"}
                        key={l.aviso.id}
                        titulo={`${l.reposicion ? `Ya tenemos otro «${l.aviso.texto}»` : `Ha llegado lo que buscabas («${l.aviso.texto}»)`}: ${l.productos[0].title} · ${formatearEuros(l.productos[0].price)}${
                          l.productos.length > 1 ? ` y ${l.productos.length - 1} más` : ""
                        }`}
                        accion="Ver"
                        onPress={() => verLlegada(l)}
                      />
                    ))}
                    {bajadas.map((b) => (
                      <Aviso
                        icono="trending-down-outline"
                        key={b.id}
                        titulo={`Ha bajado de precio: ${b.title} · antes ${formatearEuros(b.antes)}, ahora ${formatearEuros(b.ahora)}`}
                        accion="Ver"
                        onPress={() => verBajada(b)}
                      />
                    ))}
                    {!isLoggedIn ? (
                      <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 17, paddingVertical: 4 }}>
                        Inicia sesión para ver también los avisos de tus conversaciones.
                      </Text>
                    ) : null}
                  </>
                )}

                {/* «Noticias»: las Noticias Flash activas y los avisos de Noticias Gaming. Sin nada que enseñar, no sale
                    (sin la fila vacía «No hay noticias ahora mismo»). */}
                {noticias.length || !avisosNoticias || noticiasRecienActivadas ? (
                  <>
                    <TituloSeccionBlue texto="Noticias" />
                    {noticias.map((n) => (
                      <FilaBlue key={n} icono="megaphone-outline" titulo={n} />
                    ))}
                    {/* Se activan aquí mismo, con un toque (activarAvisosNoticias). */}
                    {!avisosNoticias ? (
                      <View nativeID="blue-activar-noticias">
                        <Aviso
                          icono="notifications-outline"
                          titulo={activandoNoticias ? "Activando los avisos de noticias…" : "Activa los avisos de noticias"}
                          detalle={errorAvisosNoticias ?? "Te avisamos aquí de cada noticia nueva de Noticias Gaming"}
                          accion="Activar"
                          onPress={activarAvisosNoticias}
                        />
                      </View>
                    ) : noticiasRecienActivadas ? (
                      <View nativeID="blue-noticias-activadas">
                        <Aviso
                          icono="notifications"
                          titulo="Avisos de noticias activados"
                          detalle="Te avisaremos aquí de cada noticia nueva"
                          accion="Ver noticias"
                          onPress={() => ir("/chat-global?tab=news")}
                        />
                      </View>
                    ) : null}
                  </>
                ) : null}

                {/* Ajustes de los avisos de la tienda. */}
                <TituloSeccionBlue texto="Mis avisos" />
                <View style={{ alignSelf: "stretch", gap: 10 }}>
                  {/* Consejos de los primeros momentos (mejora 12): apagarlos aquí es lo mismo que «No volver a mostrar
                      consejos»; los avisos de pedidos, precio y valoración no dependen de esto. */}
                  <View nativeID="blue-ajuste-consejos" style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }}>
                    <IconoCirculoBlue icono="bulb-outline" />
                    <Text style={{ color: COLORS.text, fontWeight: "800", flex: 1 }}>Consejos de Blue en los primeros pasos</Text>
                    <Switch
                      value={!consejosOff}
                      onValueChange={(v) => cambiarConsejos(!v, "panel")}
                      trackColor={{ false: "#D9E3EC", true: COLORS.accentSoft }}
                      thumbColor={!consejosOff ? COLORS.accent : "#F4F4F5"}
                      accessibilityLabel="Consejos de Blue en los primeros pasos"
                    />
                  </View>
                  {isLoggedIn ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }}>
                      <IconoCirculoBlue icono="bag-add-outline" />
                      <Text style={{ color: COLORS.text, fontWeight: "800", flex: 1 }}>Avisarme de los artículos nuevos</Text>
                      <Switch
                        value={avisosNovedades}
                        onValueChange={cambiarAvisosNovedades}
                        trackColor={{ false: "#D9E3EC", true: COLORS.accentSoft }}
                        thumbColor={avisosNovedades ? COLORS.accent : "#F4F4F5"}
                        accessibilityLabel="Avisarme de los artículos nuevos"
                      />
                    </View>
                  ) : (
                    // Sin sesión (dueño, 2026-11-11): los avisos de bajadas de precio y artículos nuevos son una ventaja de
                    // tener cuenta. Icono sin burbuja y la acción en texto azul (44 px), sin otra píldora.
                    <View nativeID="blue-avisos-solo-cuenta" style={{ gap: 2 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}>
                        <Ionicons name="notifications-outline" size={22} color={COLORS.accent} />
                        <Text style={{ color: COLORS.text, fontWeight: "800", lineHeight: 20, flex: 1 }}>
                          Avisos de bajadas de precio y artículos nuevos · solo con cuenta
                        </Text>
                      </View>
                      <Pressable
                        nativeID="blue-crear-cuenta-avisos"
                        onPress={crearCuentaPorAvisos}
                        accessibilityRole="button"
                        accessibilityLabel="Crear cuenta gratis"
                        style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 34, opacity: pressed ? 0.7 : 1 })}
                      >
                        <Text style={{ color: COLORS.accent, fontWeight: "900" }}>Crear cuenta gratis</Text>
                        <Ionicons name="chevron-forward" size={16} color={COLORS.accent} />
                      </Pressable>
                    </View>
                  )}

                  {isLoggedIn ? (
                    <>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <IconoCirculoBlue icono="search-outline" />
                        <Text style={{ color: COLORS.text, fontWeight: "900", flex: 1 }}>Avísame cuando llegue</Text>
                      </View>
                      <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 17 }}>
                        Escribe lo que buscas y te avisamos aquí en cuanto entre en la tienda.
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, width: "100%", maxWidth: 380 }}>
                        <TextInput
                          value={textoAviso}
                          onChangeText={(t) => {
                            setTextoAviso(t);
                            setMsgAviso(null);
                          }}
                          onSubmitEditing={anadirAviso}
                          placeholder="Ej.: Switch OLED"
                          placeholderTextColor="rgba(11,33,56,0.40)"
                          maxLength={60}
                          returnKeyType="done"
                          style={{
                            flex: 1,
                            borderWidth: 1,
                            borderColor: COLORS.border,
                            borderRadius: 999,
                            paddingHorizontal: 14,
                            paddingVertical: 9,
                            color: COLORS.text,
                            // 16px: evita el zoom automático de Safari/iOS al enfocar.
                            fontSize: 16,
                            textAlign: "center",
                          }}
                        />
                        <Pressable
                          onPress={anadirAviso}
                          accessibilityRole="button"
                          style={({ pressed }) => ({
                            opacity: pressed ? 0.85 : 1,
                            paddingVertical: 10,
                            paddingHorizontal: 16,
                            borderRadius: 999,
                            backgroundColor: COLORS.accent,
                          })}
                        >
                          <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Añadir</Text>
                        </Pressable>
                      </View>
                      {msgAviso ? <Text style={{ color: COLORS.muted, fontSize: 12 }}>{msgAviso}</Text> : null}
                      {avisosBusqueda.map((a) => (
                        <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
                          <Ionicons name="pricetag-outline" size={16} color={COLORS.muted} />
                          <Text style={{ color: COLORS.text, fontWeight: "700", flex: 1 }}>{a.texto}</Text>
                          <Pressable
                            onPress={() => quitarAviso(a.id)}
                            accessibilityRole="button"
                            accessibilityLabel={`Quitar el aviso ${a.texto}`}
                            style={{ minHeight: 44, minWidth: 64, alignItems: "center", justifyContent: "center" }}
                          >
                            <Text style={{ color: COLORS.accent, fontWeight: "900" }}>Quitar</Text>
                          </Pressable>
                        </View>
                      ))}
                    </>
                  ) : (
                    <Aviso
                      icono="search-outline"
                      titulo="Avísame cuando llegue"
                      detalle="Inicia sesión para que te avisemos cuando llegue lo que buscas"
                      accion="Iniciar sesión"
                      onPress={() => ir("/perfil?acceso=entrar")}
                    />
                  )}
                </View>
              </View>
              ) : null}
            </ScrollView>
          </Pressable>
          </Animated.View>
        </View>
      </Modal>

      {guiaAbierta ? (
        <GuiaBlue
          onCerrar={cerrarGuia}
          onIr={(ruta) => {
            cerrarGuia();
            router.push(ruta as Href);
          }}
          onInstalar={() => {
            cerrarGuia();
            instalarApp();
          }}
          instalable={!!modoInst}
          conSesion={isLoggedIn}
          onSenalaBlue={setGuiaSenalaBlue}
          seccion={guiaMini?.seccion}
          rutaFija={guiaMini?.ruta}
        />
      ) : null}

      {/* Blue le pregunta al dueño (panel de administración): la respuesta la escribe él. */}
      <Modal visible={!!propuesta} transparent animationType="fade" onRequestClose={() => cerrarPropuesta("ahora-no")}>
        <Pressable
          onPress={() => cerrarPropuesta("ahora-no")}
          style={{ flex: 1, backgroundColor: FONDO_GUIA, justifyContent: "center", alignItems: "center", padding: 14 }}
        >
          <Pressable
            onPress={() => undefined}
            style={{ width: "100%", maxWidth: 440, backgroundColor: COLORS.bg, borderRadius: 24, padding: 18, gap: 12, alignItems: "center" }}
          >
            <Ionicons name="bulb-outline" size={26} color={COLORS.accent} />
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>{propuesta?.tema}</Text>
            <Text style={{ color: COLORS.text, fontSize: 15, lineHeight: 22, fontWeight: "600", textAlign: "center" }}>
              {propuesta?.pregunta}
            </Text>
            <TextInput
              value={respuestaProp}
              onChangeText={setRespuestaProp}
              placeholder="Escribe la respuesta real de la tienda"
              placeholderTextColor={COLORS.muted}
              multiline
              maxLength={800}
              style={{
                alignSelf: "stretch",
                minHeight: 110,
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 16,
                padding: 12,
                textAlign: "center",
                color: COLORS.text,
                // 16 px (CAMPO.letra de constants/temaTienda.ts): con menos, Safari del iPhone hace zoom al escribir.
                fontSize: CAMPO.letra,
                backgroundColor: "#F6FAFD",
              }}
            />
            {errorProp ? <Text style={{ color: "#B91C1C", fontWeight: "800", textAlign: "center" }}>{errorProp}</Text> : null}
            <Pressable
              onPress={guardarPropuesta}
              disabled={guardandoProp}
              accessibilityRole="button"
              style={{ alignSelf: "stretch", minHeight: 52, borderRadius: 999, backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center", opacity: guardandoProp ? 0.6 : 1 }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>{guardandoProp ? "Guardando…" : "Guardar"}</Text>
            </Pressable>
            <View style={{ flexDirection: "row", gap: 18, alignItems: "center" }}>
              <Pressable onPress={() => cerrarPropuesta("ahora-no")} hitSlop={8} accessibilityRole="button">
                <Text style={{ color: COLORS.muted, fontWeight: "800" }}>Ahora no</Text>
              </Pressable>
              <Pressable onPress={() => cerrarPropuesta("no-aplica")} hitSlop={8} accessibilityRole="button">
                <Text style={{ color: COLORS.muted, fontWeight: "800" }}>No aplica</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  cerrarPropuesta("ahora-no");
                  router.push("/admin/conocimiento" as Href);
                }}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={{ color: COLORS.accent, fontWeight: "900" }}>Ver lo que sé</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* iPhone/iPad: no hay botón de instalar; se enseñan los pasos de Safari. */}
      <Modal visible={animPasosIos.montada} transparent animationType="none" onRequestClose={() => setPasosIosAbiertos(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", alignItems: "center", padding: 12 }}>
          <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: FONDO_GUIA }, animPasosIos.fondo]}>
            <Pressable onPress={() => setPasosIosAbiertos(false)} accessibilityLabel="Cerrar" style={{ flex: 1 }} />
          </Animated.View>
          <Animated.View style={[{ width: "100%", alignItems: "center" }, animPasosIos.hoja]}>
          <Pressable
            onPress={() => undefined}
            style={{ width: "100%", maxWidth: 420, backgroundColor: COLORS.bg, borderRadius: 24, padding: 20, gap: 12, alignItems: "center" }}
          >
            <Ionicons name="download-outline" size={26} color={COLORS.accent} />
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 19, textAlign: "center" }}>Instala la tienda en tu iPhone</Text>
            <Text style={{ color: COLORS.text, fontSize: 15, lineHeight: 22, fontWeight: "600", textAlign: "center" }}>
              {"1. Toca el botón Compartir de Safari (el cuadrado con una flecha hacia arriba).\n2. Elige «Añadir a pantalla de inicio».\n3. Toca «Añadir». Ya la tendrás como una app."}
            </Text>
            <Pressable
              onPress={() => setPasosIosAbiertos(false)}
              accessibilityRole="button"
              style={{ alignSelf: "stretch", minHeight: 52, borderRadius: 999, backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>Entendido</Text>
            </Pressable>
          </Pressable>
          </Animated.View>
        </View>
      </Modal>

      {/* «Mejoras en la tienda» (desde el Asistente). */}
      <VentanaMejoras visible={mejorasAbierta} onClose={() => setMejorasAbierta(false)} origen="blue" />

      {capaConsejo}
    </>
  );
}
