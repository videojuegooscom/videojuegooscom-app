/**
 * Archivo: components/blue/PasosGuia.tsx
 * Función: pasos y piezas de la guía de Blue («Te enseño la tienda»): los pasos de cada sección, sus nombres, la
 *          sombra con hueco, la mano que toca, los nombres de las secciones, el selector, los ejemplos del buscador,
 *          las pastillas del foro, las filas de iconos y las medidas de la tarjeta.
 * Para qué sirve: que la guía (components/blue/GuiaBlue.tsx) y Blue (components/AsistenteBlue.tsx) usen los mismos
 *          pasos sin copiarlos. Se separó de components/AsistenteBlue.tsx en la tanda 6 de «ordenar el proyecto»
 *          (2026-11-18), sin cambiar nada.
 * Conectado con: components/blue/DatosBlue.tsx, components/blue/AyudasBlue.tsx, components/blue/PiezasBlue.tsx.
 * Utilizado por: components/blue/GuiaBlue.tsx y components/AsistenteBlue.tsx.
 * Dependencias: react, react-native, @expo/vector-icons.
 * Estado: ACTIVO
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { asegurarCssSiriTexto, TextoSiri } from "../BarraBusqueda";
import { TAMANOS } from "../../constants/temaTienda";
import { COLORS, PagoOnlineGuia } from "./DatosBlue";
import { BLUE_DOM_ID, USA_NATIVO, limitar } from "./AyudasBlue";
import { Caja } from "./PiezasBlue";

// --- Guía de bienvenida de Blue ----------------------------------------------------------
// Pasos cortos, cercanos y con datos reales de la tienda. Se usa con un solo dedo: deslizar
// la tarjeta o tocar «Siguiente» (abajo a la derecha, donde llega el pulgar derecho).
// En la web, cada paso puede SEÑALAR el botón del que habla: se oscurece todo menos ese
// botón, que queda dentro de un aro azul que late, con una flecha que lo apunta.
// «objetivo» son selectores CSS (si hay varios, se señala el conjunto); si no se encuentran
// en pantalla, el paso se explica sin señalar.
// Más imagen que letra: cada paso lleva un texto de una línea y, además, se ENSEÑA con movimiento: una mano que
// toca lo señalado («gesto»), las secciones de la barra de abajo escribiéndose con el brillo de Siri, un ejemplo
// que se escribe solo en el buscador, el botón «Vender ahora» que se pulsa solo y el formulario que se desplaza…
type DemoGuia =
  | "secciones" // los nombres de las 5 secciones se escriben con brillo Siri y se puede pasar de una a otra
  | "buscador" // escribe «lo último añadido» y «lo más antiguo» en el buscador
  | "vender-toque" // la mano pulsa «Vender ahora» y la guía pasa sola al formulario
  | "formulario" // el formulario se desplaza un poco para enseñar que hay más abajo
  | "salir-formulario" // se señala cómo salir del formulario
  | "perfil-cuenta" // en Perfil con sesión, se pone la pestaña «Mi cuenta»
  | "perfil-seguimientos" // en Perfil con sesión, la guía pulsa la pestaña «Mis seguimientos» y se ve su contenido
  | "perfil-pedidos" // en Perfil con sesión, la guía deja puesta «Mis seguimientos» para enseñar los filtros de Mis pedidos
  | "perfil-megusta" // en Perfil con sesión, la guía pulsa la pestaña «Me gusta»
  | "foro-pestanas" // la guía despliega el selector del Foro y enseña cada pestaña, una por una
  | "foro-chat" // la guía abre la pestaña «Foro» (los mensajes) y la tarjeta enseña cómo reaccionar y responder
  | "capacidades" // lo que Blue sabe hacer (iconos en la tarjeta)
  | "como-se-compra"; // los pasos de una compra (iconos en la tarjeta)

// Pantallas que tienen mini-guía (botón «Guía rápida» en el panel de Blue): cada una enseña solo los pasos de ESA pantalla.
export type SeccionGuia = "inicio" | "catalogo" | "producto" | "vender" | "perfil" | "cesta" | "foro" | "blue-ia" | "servicios";
// Lo que el texto de un paso puede necesitar saber además de la sesión.
type ContextoTextoGuia = { pagarVisible: boolean; pago: PagoOnlineGuia | null };

// «tarjeta», «tarjeta y Bizum» o «tarjeta, Bizum y Klarna»: solo lo que el servidor ofrece.
function formasDePagoOnline(p: PagoOnlineGuia | null): string | null {
  if (!p?.disponible) return null;
  const f = ["tarjeta", ...(p.bizum ? ["Bizum"] : []), ...(p.klarna ? ["Klarna"] : [])];
  return f.length === 1 ? f[0] : `${f.slice(0, -1).join(", ")} y ${f[f.length - 1]}`;
}

export type PasoGuia = {
  icono: React.ComponentProps<typeof Ionicons>["name"];
  titulo: string;
  // Mini-guía a la que pertenece el paso (la pantalla donde se enseña). Sin ella, solo sale en la guía completa.
  seccion?: SeccionGuia;
  texto: string | ((conSesion: boolean, ctx: ContextoTextoGuia) => string);
  objetivo?: string[];
  // Si no se encuentra nada de lo de «objetivo» en pantalla, se señala esto (p. ej. «Ir a pagar» con la cesta vacía → la pestaña).
  alternativa?: string[];
  // Solo se enseña si la reparación por envío está activa (reparacion_envio_ajustes.activo); si no, ni se menciona.
  soloConEnvio?: boolean;
  // Tarjeta baja (sin la mascota): deja ver la página que se enseña (el formulario, Perfil, Servicios…).
  compacta?: boolean;
  // No enmarca el título de la página (primer paso, instalar y cuenta no hablan de ninguna página).
  sinTitulo?: boolean;
  // Solo se enseña con sesión iniciada / solo sin ella.
  soloConSesion?: boolean;
  soloSinSesion?: boolean;
  // Solo se enseña si la tienda tiene algún artículo publicado al que llevar a la persona (la ruta lleva «{producto}»).
  soloConProducto?: boolean;
  // No oscurece la página (se quiere ver entera, p. ej. los mensajes del Foro).
  sinOscurecer?: boolean;
  // Si lo señalado es muy alto (la tarjeta de un servicio), solo se enmarca su parte de arriba, para que la tarjeta de la
  // guía no lo tape.
  limiteAlto?: number;
  // Selector del botón señalado: tocar dentro del recuadro lo pulsa de verdad (la guía tapa la página, así que
  // sin esto «probarlo» no hacía nada).
  probar?: string;
  // Pantalla en la que se explica el paso: la guía navega sola hasta ella (como si te llevara
  // de la mano). Si no se indica, se queda en Inicio.
  ruta?: string;
  // Selector de lo que hay que traer a la vista (desplazando la pantalla) antes de señalarlo.
  desplazar?: string;
  // Lleva Inicio arriba del todo antes de señalar (p. ej. para que se vea el buscador).
  arriba?: boolean;
  accion?: { texto: string; ruta?: string; instalar?: boolean };
  cuenta?: boolean;
  // Solo se enseña si la tienda se puede instalar en este dispositivo.
  soloInstalable?: boolean;
  // Mano animada: «toque» sobre lo señalado; «siguiente» sobre el botón «Siguiente» de la tarjeta.
  gesto?: "toque" | "siguiente";
  demo?: DemoGuia;
};

const PESTANAS = ["index", "perfil", "cesta", "foro", "blue-ia"].map((p) => `[data-testid="pestana-${p}"]`);
// El botón «Ir a pagar» entero: su nativeID (cesta-pagar) está en el contenido, así que se señala el botón que lo contiene.
export const BOTON_IR_A_PAGAR = "div:has(> #cesta-pagar)";

export const PASOS_GUIA: PasoGuia[] = [
  {
    icono: "hand-left-outline",
    titulo: "¡Hola! Soy Blue",
    texto: "Toca «Siguiente» para empezar.",
    gesto: "siguiente",
    sinTitulo: true,
  },
  {
    icono: "apps-outline",
    titulo: "Las 5 secciones",
    texto: "Toca una para cambiar de sección.",
    objetivo: PESTANAS,
    demo: "secciones",
    sinTitulo: true, // ya se enmarca toda la barra
  },
  {
    icono: "home-outline",
    titulo: "Inicio",
    seccion: "inicio",
    texto: "Ofertas, novedades y categorías.",
    objetivo: [PESTANAS[0]],
    ruta: "/",
    desplazar: '[data-testid="boton-ver-categorias"]',
    gesto: "toque",
  },
  {
    icono: "apps-outline",
    titulo: "Ver categorías",
    seccion: "inicio",
    texto: "Te lleva directo a las categorías.",
    objetivo: ['[data-testid="boton-ver-categorias"]'],
    ruta: "/",
    desplazar: '[data-testid="boton-ver-categorias"]',
    gesto: "toque",
  },
  {
    icono: "grid-outline",
    titulo: "Las categorías",
    seccion: "inicio",
    texto: "Toca una y verás sus artículos.",
    objetivo: ['[data-testid="seccion-categorias"]'],
    ruta: "/",
    desplazar: '[data-testid="seccion-categorias"]',
  },
  {
    icono: "options-outline",
    titulo: "Filtros y orden",
    seccion: "catalogo",
    texto: "Filtra por plataforma, estado y precio, y ordena.",
    objetivo: ['[aria-label^="Filtros"]'],
    ruta: "/catalogo",
    compacta: true,
  },
  {
    icono: "bag-add-outline",
    titulo: "Un artículo",
    seccion: "producto",
    // «Añadir» reserva el artículo 15 minutos (lib/reservas.ts); «Comprar ya» lleva directo a pedir, con sesión.
    texto: "«Añadir» lo reserva 15 minutos. «Comprar ya» va directo a pedir.",
    // Por su id: «Añadir … a la cesta» también lo llevan las tarjetas del carrusel de debajo de la ficha y, si asomaban,
    // el recuadro las incluía (app/producto/[id].tsx: ficha-anadir-cesta y ficha-comprar-ya).
    objetivo: ["#ficha-anadir-cesta", "#ficha-comprar-ya"],
    // ?guia=1: la ficha no suma una visita ni un evento de analítica por esta demostración.
    ruta: "/producto/{producto}?guia=1",
    desplazar: "#ficha-comprar-ya",
    soloConProducto: true,
    compacta: true,
  },
  {
    icono: "cash-outline",
    titulo: "Vender ahora",
    seccion: "inicio",
    texto: "Mira: lo pulso y se abre el formulario.",
    objetivo: ['[data-testid="boton-vender-ahora"]'],
    ruta: "/",
    desplazar: '[data-testid="boton-vender-ahora"]',
    gesto: "toque",
    demo: "vender-toque",
  },
  {
    icono: "create-outline",
    titulo: "Vender mi artículo",
    seccion: "vender",
    texto: "Rellenas tus datos y bajas para ver el resto.",
    objetivo: ["#vender-scroll"],
    ruta: "/vender",
    demo: "formulario",
    compacta: true,
  },
  {
    icono: "arrow-back-circle-outline",
    titulo: "Para salir",
    seccion: "vender",
    texto: "Toca la flecha para volver.",
    objetivo: ['[aria-label="Volver atrás"]'],
    ruta: "/vender",
    gesto: "toque",
    demo: "salir-formulario",
    compacta: true,
  },
  {
    icono: "search-outline",
    titulo: "El buscador",
    seccion: "inicio",
    texto: "Escribe lo que buscas. Prueba con estos.",
    objetivo: ["#buscador-flotante", "#buscador-resultados"],
    ruta: "/",
    arriba: true,
    demo: "buscador",
  },
  {
    icono: "person-outline",
    titulo: "Perfil",
    seccion: "perfil",
    // Con sesión se enseña la pestaña «Mi cuenta» (y en el paso siguiente «Mis seguimientos»); sin sesión, el acceso.
    // Sin sesión se cuenta que con cuenta se ven los pedidos, las facturas y los «Me gusta».
    texto: (conSesion) => (conSesion ? "«Mi cuenta»: tu perfil y tu sesión." : "Aquí entras o creas tu cuenta y ves tus pedidos y facturas."),
    objetivo: ["#perfil-pestanas", "#perfil-acceso"],
    ruta: "/perfil",
    demo: "perfil-cuenta",
    compacta: true,
  },
  {
    icono: "file-tray-full-outline",
    titulo: "Mis seguimientos",
    seccion: "perfil",
    texto: "Aquí ves tus reparaciones y pedidos.",
    objetivo: ["#perfil-pestanas"],
    ruta: "/perfil",
    gesto: "toque",
    demo: "perfil-seguimientos",
    soloConSesion: true,
    compacta: true,
  },
  {
    icono: "albums-outline",
    titulo: "Mis pedidos",
    seccion: "perfil",
    // perfil.tsx (FiltrosPedidos, nativeID «seguimiento-filtros»): Todos, En curso, Completados, Cancelados y, si ya hay
    // facturas, Facturas. Sin pedidos no hay filtros: se señalan las pestañas.
    texto: "Filtra tus pedidos por su estado.",
    objetivo: ["#seguimiento-filtros"],
    alternativa: ["#perfil-pestanas"],
    ruta: "/perfil",
    gesto: "toque",
    demo: "perfil-pedidos",
    soloConSesion: true,
    compacta: true,
  },
  {
    icono: "document-text-outline",
    titulo: "Tus facturas",
    seccion: "perfil",
    // Plazos: la regla del dueño del 2026-11-11 (api/blue-ia.ts, «PLAZO DE LA FACTURA»): 24 h con tarjeta, 24-48 h en
    // efectivo u otra forma. «Descargar factura» sale en cada pedido cuando ya está.
    texto: "Tus facturas, en Mis pedidos → Facturas. Tarjeta 24 h, efectivo 24-48 h.",
    objetivo: ["#seguimiento-filtro-facturas"],
    alternativa: ["#seguimiento-filtros", "#perfil-pestanas"],
    ruta: "/perfil",
    gesto: "toque",
    demo: "perfil-pedidos",
    accion: { texto: "Ver mis facturas", ruta: "/perfil?tab=seguimientos&filtro=facturas" },
    soloConSesion: true,
    compacta: true,
  },
  {
    icono: "heart-outline",
    titulo: "Me gusta",
    seccion: "perfil",
    texto: "Tus artículos y servicios favoritos.",
    objetivo: ["#perfil-pestanas"],
    ruta: "/perfil",
    gesto: "toque",
    demo: "perfil-megusta",
    soloConSesion: true,
    compacta: true,
  },
  {
    icono: "bag-handle-outline",
    titulo: "Cesta",
    seccion: "cesta",
    // Con artículos se señala «Ir a pagar» (nativeID cesta-pagar de app/(tabs)/cesta.tsx); con la cesta vacía, la pestaña.
    texto: (_s, ctx) => (ctx.pagarVisible ? "Reservado 15 minutos. Toca «Ir a pagar»." : "Te reservamos cada artículo 15 minutos."),
    objetivo: [BOTON_IR_A_PAGAR],
    alternativa: [PESTANAS[2]],
    ruta: "/cesta",
    gesto: "toque",
    compacta: true,
  },
  {
    icono: "receipt-outline",
    titulo: "Cómo se compra",
    seccion: "cesta",
    // Verificado en app/checkout.tsx: se elige envío o entrega en mano, se paga online o se confirma sin pagar («Otras formas
    // de pago») y se habla por el chat. Las formas de pago online las dice GET /api/pago (la misma consulta que el checkout:
    // tarjeta, Bizum y Klarna solo si el servidor las ofrece); si no se sabe, el texto no promete ninguna.
    texto: (_s, ctx) => {
      const formas = formasDePagoOnline(ctx.pago);
      return formas ? `Pago seguro online (${formas}) u otras formas de pago.` : "Reservas, confirmas el pedido y te hablamos por el chat.";
    },
    ruta: "/cesta",
    demo: "como-se-compra",
    sinOscurecer: true,
  },
  {
    icono: "chatbubbles-outline",
    titulo: "Foro",
    seccion: "foro",
    texto: "Comunidad, noticias, torneos y chats.",
    objetivo: [PESTANAS[3]],
    ruta: "/chat-global",
    gesto: "toque",
    compacta: true,
  },
  {
    icono: "swap-vertical-outline",
    titulo: "Las pestañas del Foro",
    seccion: "foro",
    texto: "Toca el botón azul y elige una. Mantén pulsada una para moverla.",
    objetivo: ['[data-testid="selector-pestanas"]'],
    ruta: "/chat-global",
    gesto: "toque",
    demo: "foro-pestanas",
    probar: '[data-testid="selector-pestanas"]',
  },
  {
    icono: "chatbox-ellipses-outline",
    titulo: "Reacciona y responde",
    seccion: "foro",
    // chat-global.tsx: un toque en un mensaje abre las reacciones, dos toques seguidos responden (con sesión).
    texto: "Un toque en un mensaje reacciona; dos, responden. Con sesión.",
    ruta: "/chat-global",
    demo: "foro-chat",
    sinOscurecer: true,
  },
  {
    icono: "sparkles-outline",
    titulo: "Blue IA",
    seccion: "blue-ia",
    texto: "Pregúntame lo que quieras.",
    objetivo: [PESTANAS[4]],
    ruta: "/blue-ia",
    gesto: "toque",
    compacta: true,
  },
  {
    icono: "headset-outline",
    titulo: "Hablar con el equipo",
    seccion: "blue-ia",
    // blue-ia.tsx: primero responde Blue IA; «Hablar con el equipo» pide sesión y le manda un resumen al equipo.
    texto: "Primero te ayudo yo. Si quieres, te paso con el equipo (con sesión).",
    objetivo: ['[aria-label="Hablar con el equipo"]'],
    ruta: "/blue-ia",
    gesto: "toque",
    compacta: true,
  },
  {
    icono: "happy-outline",
    titulo: "Este soy yo",
    texto: "Respondo dudas, te paso con el equipo y, con tu cuenta, te aviso de bajadas y novedades.",
    objetivo: [`#${BLUE_DOM_ID}`],
    ruta: "/",
    desplazar: '[data-testid="boton-ver-categorias"]',
    gesto: "toque",
    demo: "capacidades",
  },
  {
    icono: "download-outline",
    titulo: "Instala la tienda",
    texto: "Ábrela con un toque, sin navegador.",
    ruta: "/",
    soloInstalable: true,
    accion: { texto: "Instalar la app", instalar: true },
    sinTitulo: true,
  },
  {
    icono: "construct-outline",
    titulo: "Reparación y limpieza",
    seccion: "servicios",
    texto: "Elige un servicio y te lo explicamos.",
    objetivo: ["#servicios-lista"],
    ruta: "/servicios",
    compacta: true,
    sinOscurecer: true, // la página se ve entera (cargue ya o no sus servicios)
    limiteAlto: 130, // el primer servicio es una tarjeta alta: se enmarca su parte de arriba
  },
  {
    icono: "mail-outline",
    titulo: "Reparación por envío",
    seccion: "servicios",
    // Reparación por envío (lib/envio.ts, ajustes activos): se manda el aparato por Correos con una etiqueta, llega el
    // presupuesto y se sigue en «Mis seguimientos». Solo se enseña si la tienda la tiene activa.
    texto: "¿Lejos? Nos lo mandas por Correos: etiqueta, presupuesto y lo sigues en Mis seguimientos.",
    objetivo: ["#servicios-lista"],
    ruta: "/servicios",
    soloConEnvio: true,
    compacta: true,
    sinOscurecer: true,
    limiteAlto: 130,
  },
  {
    icono: "person-circle-outline",
    titulo: "Tu cuenta",
    texto: "Guarda tus chats y pedidos. Con tu cuenta, Blue te avisa de bajadas de precio y artículos nuevos.",
    cuenta: true,
    soloSinSesion: true,
    sinTitulo: true,
  },
];

// Mini-guías: qué pantalla tiene guía rápida y cómo se llama en la fila «Guías rápidas» del panel de Blue. Las demás
// (Blog, políticas, chats, pedido…) no la tienen. Blue no se ve en Vender, el Foro ni Blue IA, por eso las guías se
// eligen desde el panel de Blue (en otra pantalla) y no desde la propia pantalla.
export function seccionDeGuia(pathname: string): SeccionGuia | null {
  if (pathname === "/") return "inicio";
  if (pathname === "/catalogo") return "catalogo";
  if (pathname.startsWith("/producto/")) return "producto";
  if (pathname === "/vender") return "vender";
  if (pathname === "/perfil") return "perfil";
  if (pathname === "/cesta") return "cesta";
  if (pathname === "/chat-global") return "foro";
  if (pathname === "/blue-ia") return "blue-ia";
  if (pathname === "/servicios") return "servicios";
  return null;
}
export const NOMBRE_SECCION_GUIA: Record<SeccionGuia, string> = {
  inicio: "Inicio",
  catalogo: "Catálogo",
  producto: "Artículo",
  vender: "Vender",
  perfil: "Perfil",
  cesta: "Cesta",
  foro: "Foro",
  "blue-ia": "Blue IA",
  servicios: "Servicios",
};

// Dónde está el TÍTULO de cada página, para enmarcarlo en cada paso («Estás aquí»): en las cinco secciones es su
// nombre en la barra de abajo (Foro, Cesta y Blue IA no tienen otro título arriba) y en Vender y Servicios su h1.
const TITULO_DE_PAGINA: Record<string, string[]> = {
  "/": [PESTANAS[0]],
  "/perfil": [PESTANAS[1]],
  "/cesta": [PESTANAS[2]],
  "/chat-global": [PESTANAS[3]],
  "/blue-ia": [PESTANAS[4]],
  "/vender": ["h1"],
  "/servicios": ["h1"],
  "/catalogo": ["h1"],
};
// Las fichas de producto (/producto/<id>) tienen su nombre como h1.
export const tituloDePagina = (pathname: string): string[] | null =>
  TITULO_DE_PAGINA[pathname] ?? (pathname.startsWith("/producto/") ? ["h1"] : null);

export const FONDO_GUIA = "rgba(11,33,56,0.58)";
export const MARGEN_ARO = 6;
// Tiempo mínimo antes de dar por asentado lo señalado en un paso que desplaza la página (último reintento a 2,9 s + desplazamiento suave).
export const ASENTAR_TRAS_REINTENTOS_MS = 3500;

// Rectángulos que oscurecen TODA la pantalla menos los huecos (uno o dos recuadros iluminados): se corta la pantalla en
// franjas horizontales y, en cada una, se tapa lo que no cae dentro de ningún hueco.
export function panesOscuros(huecos: Caja[], ancho: number, alto: number): Caja[] {
  const ys = Array.from(
    new Set([0, alto, ...huecos.flatMap((h) => [limitar(h.y, 0, alto), limitar(h.y + h.h, 0, alto)])])
  ).sort((a, b) => a - b);
  const panes: Caja[] = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const y1 = ys[i];
    const y2 = ys[i + 1];
    if (y2 - y1 < 0.5) continue;
    const medio = (y1 + y2) / 2;
    const tramos = huecos
      .filter((h) => h.y <= medio && h.y + h.h >= medio)
      .map((h) => [Math.max(0, h.x), Math.min(ancho, h.x + h.w)] as const)
      .sort((a, b) => a[0] - b[0]);
    let x = 0;
    for (const [a, b] of tramos) {
      if (a > x) panes.push({ x, y: y1, w: a - x, h: y2 - y1 });
      x = Math.max(x, b);
    }
    if (x < ancho) panes.push({ x, y: y1, w: ancho - x, h: y2 - y1 });
  }
  return panes;
}

// Desplaza un elemento con el scrollTo/scrollBy del navegador (solo web). react-native-web cambia el scrollTo de sus
// ScrollView por uno que espera { y, animated } e ignora { top }: el desplazamiento no se hace y no avisa de nada.
export function desplazarDom(el: Element, opciones: ScrollToOptions, relativo = false) {
  const metodo = relativo ? Element.prototype.scrollBy : Element.prototype.scrollTo;
  (metodo as (this: Element, o: ScrollToOptions) => void).call(el, opciones);
}

// --- Ayudas visuales de la guía (menos letras, más imagen) -------------------------------------

// Mano que enseña dónde tocar: sube hasta el sitio, lo «pulsa» (se encoge un poco) y de ahí sale un círculo que
// se abre. (x, y) es el punto que se toca.
export function ManoToque({ x, y, tamano = 40 }: { x: number; y: number; tamano?: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    t.setValue(0);
    const bucle = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: USA_NATIVO }));
    bucle.start();
    return () => bucle.stop();
  }, [t]);
  const sube = t.interpolate({ inputRange: [0, 0.25, 0.7, 1], outputRange: [22, 0, 0, 12] });
  const escala = t.interpolate({ inputRange: [0, 0.3, 0.4, 0.55, 1], outputRange: [1, 1, 0.84, 1, 1] });
  const opacidad = t.interpolate({ inputRange: [0, 0.12, 0.85, 1], outputRange: [0, 1, 1, 0] });
  const circulo = t.interpolate({ inputRange: [0.35, 0.85], outputRange: [0.3, 1.5], extrapolate: "clamp" });
  const brilloCirculo = t.interpolate({ inputRange: [0.35, 0.5, 0.85], outputRange: [0, 0.6, 0], extrapolate: "clamp" });
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: x - 28,
          top: y - 28,
          width: 56,
          height: 56,
          borderRadius: 28,
          borderWidth: 3,
          borderColor: COLORS.accent,
          backgroundColor: "rgba(30,167,232,0.18)",
          opacity: brilloCirculo,
          transform: [{ scale: circulo }],
        }}
      />
      {/* Siempre un ICONO de la app (nunca un emoji): huella táctil blanca en un círculo azul de marca. */}
      <Animated.View
        testID="guia-toque"
        pointerEvents="none"
        style={{
          position: "absolute",
          // La esquina de arriba a la izquierda toca el punto señalado (como la punta de un cursor).
          left: x - 10,
          top: y - 10,
          width: tamano + 6,
          height: tamano + 6,
          borderRadius: (tamano + 6) / 2,
          backgroundColor: COLORS.accent,
          borderWidth: 3,
          borderColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
          opacity: opacidad,
          transform: [{ translateY: sube }, { scale: escala }],
          shadowColor: "#0B2138",
          shadowOpacity: 0.3,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        <Ionicons name="finger-print" size={Math.round(tamano * 0.7)} color="#FFFFFF" />
      </Animated.View>
    </>
  );
}

// Las 5 secciones de la barra de abajo (ids de data-testid="pestana-*" en app/(tabs)/_layout.tsx).
export const SECCIONES_GUIA = [
  { id: "index", nombre: "Inicio", ruta: "/", icono: "home-outline" },
  { id: "perfil", nombre: "Perfil", ruta: "/perfil", icono: "person-outline" },
  { id: "cesta", nombre: "Cesta", ruta: "/cesta", icono: "bag-handle-outline" },
  { id: "foro", nombre: "Foro", ruta: "/chat-global", icono: "chatbubbles-outline" },
  { id: "blue-ia", nombre: "Blue IA", ruta: "/blue-ia", icono: "sparkles-outline" },
] as const;

// Caja en pantalla del NOMBRE de cada sección en la barra de abajo (el último texto suelto dentro de su botón).
function medirNombresSecciones(): (Caja | null)[] {
  if (Platform.OS !== "web" || typeof document === "undefined") return SECCIONES_GUIA.map(() => null);
  return SECCIONES_GUIA.map((s) => {
    const boton = document.querySelector(`[data-testid="pestana-${s.id}"]`);
    if (!boton) return null;
    const hoja = Array.from(boton.querySelectorAll("*")).find((n) => n.children.length === 0 && (n.textContent ?? "").trim() === s.nombre);
    const r = (hoja ?? boton).getBoundingClientRect();
    return r.width > 4 && r.height > 4 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  });
}

// Paso «Las 5 secciones»: los nombres de la barra de abajo se van ESCRIBIENDO uno tras otro con el brillo de Siri
// (una mano toca cada uno), y se repite cada pocos segundos. Si se elige una sección en la tarjeta, solo se
// vuelve a escribir su nombre.
export function NombresSeccionesSiri({ pathname, elegida }: { pathname: string; elegida: { i: number; n: number } }) {
  const [cajas, setCajas] = useState<(Caja | null)[]>(() => SECCIONES_GUIA.map(() => null));
  const [escritas, setEscritas] = useState<number[]>(() => SECCIONES_GUIA.map(() => 0));
  const [activa, setActiva] = useState(-1);

  useEffect(() => {
    asegurarCssSiriTexto();
    const medir = () => setCajas(medirNombresSecciones());
    const t0 = setTimeout(medir, 250);
    const t1 = setTimeout(medir, 900);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, [pathname]);

  // Mientras nadie elige nada: se escriben los cinco, se quedan brillando y vuelven a empezar.
  useEffect(() => {
    if (elegida.n > 0) return;
    let cancelado = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const espera = (ms: number) => new Promise<void>((ok) => timers.push(setTimeout(ok, ms)));
    (async () => {
      await espera(600);
      while (!cancelado) {
        setEscritas(SECCIONES_GUIA.map(() => 0));
        for (let i = 0; i < SECCIONES_GUIA.length && !cancelado; i++) {
          setActiva(i);
          for (let k = 1; k <= SECCIONES_GUIA[i].nombre.length && !cancelado; k++) {
            setEscritas((prev) => prev.map((v, j) => (j === i ? k : v)));
            await espera(95);
          }
          await espera(650);
        }
        setActiva(-1);
        await espera(4500);
      }
    })();
    return () => {
      cancelado = true;
      timers.forEach(clearTimeout);
    };
  }, [elegida.n]);

  // Al elegir una sección: todos los nombres a la vista y solo se vuelve a escribir el elegido.
  useEffect(() => {
    if (elegida.n === 0 || elegida.i < 0) return;
    let cancelado = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const espera = (ms: number) => new Promise<void>((ok) => timers.push(setTimeout(ok, ms)));
    (async () => {
      setEscritas(SECCIONES_GUIA.map((s, j) => (j === elegida.i ? 0 : s.nombre.length)));
      setActiva(elegida.i);
      await espera(350);
      for (let k = 1; k <= SECCIONES_GUIA[elegida.i].nombre.length && !cancelado; k++) {
        setEscritas((prev) => prev.map((v, j) => (j === elegida.i ? k : v)));
        await espera(95);
      }
      await espera(500);
      if (!cancelado) setActiva(-1);
    })();
    return () => {
      cancelado = true;
      timers.forEach(clearTimeout);
    };
  }, [elegida]);

  const caja = activa >= 0 ? cajas[activa] : null;
  return (
    <>
      {cajas.map((c, i) =>
        c ? (
          <View
            key={SECCIONES_GUIA[i].id}
            pointerEvents="none"
            // Un parche blanco tapa el nombre de siempre y encima se escribe el nuevo.
            // (13 px de letra: el parche es al menos de 17 px de alto, centrado sobre el nombre de siempre)
            style={{ position: "absolute", left: c.x - 3, top: c.y - 1 - Math.max(0, (17 - (c.h + 2)) / 2), width: c.w + 6, height: Math.max(c.h + 2, 17), backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}
          >
            <TextoSiri
              texto={SECCIONES_GUIA[i].nombre.slice(0, escritas[i])}
              cursor={activa === i && escritas[i] < SECCIONES_GUIA[i].nombre.length}
              style={{ fontSize: TAMANOS.minimo, lineHeight: 15, fontWeight: "800" }}
            />
          </View>
        ) : null
      )}
      {caja ? <ManoToque x={caja.x + caja.w / 2} y={caja.y - 14} tamano={34} /> : null}
    </>
  );
}

// Fila de 5 botones redondos para pasar de una sección a otra sin salir de la guía.
export function SelectorSecciones({ activa, ancho, onElegir }: { activa: number; ancho: number; onElegir: (i: number) => void }) {
  const lado = Math.min(50, Math.floor((ancho - 36 - 4 * 8) / 5));
  return (
    <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
      {SECCIONES_GUIA.map((s, i) => (
        <Pressable
          key={s.id}
          onPress={() => onElegir(i)}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`Ir a ${s.nombre}`}
          style={({ pressed }) => ({
            width: lado,
            height: lado,
            borderRadius: lado / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: i === activa ? COLORS.accent : COLORS.accentSoft,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Ionicons name={s.icono} size={Math.round(lado * 0.48)} color={i === activa ? "#FFFFFF" : COLORS.accent} />
        </Pressable>
      ))}
    </View>
  );
}

// Ejemplos que la guía escribe sola en el buscador: el NOMBRE del último artículo añadido y el del más antiguo (se
// leen de la tienda). Si no se pueden leer, se escribe «lo último añadido» y «lo más antiguo», que el buscador entiende.
export type EjemploBuscador = { texto: string; etiqueta: string; icono: React.ComponentProps<typeof Ionicons>["name"] };
export const EJEMPLOS_POR_DEFECTO: EjemploBuscador[] = [
  { texto: "lo último añadido", etiqueta: "Último añadido", icono: "time-outline" },
  { texto: "lo más antiguo", etiqueta: "Más antiguo", icono: "hourglass-outline" },
];

// Un nombre largo se recorta a unas pocas palabras: buscarlo así encuentra el artículo igual.
function recortarNombre(nombre: string): string {
  const t = nombre.replace(/\s+/g, " ").trim();
  if (t.length <= 40) return t;
  return t.slice(0, 40).replace(/\s+\S*$/, "") || t.slice(0, 40);
}

// Nombre del artículo publicado más reciente (o más antiguo). Vacío si no se puede leer.
export async function nombreDeArticulo(masAntiguo: boolean): Promise<string> {
  const { data, error } = await supabase
    .from("products")
    .select("title")
    .eq("is_active", true)
    .eq("status", "PUBLISHED")
    .order("created_at", { ascending: masAntiguo })
    .limit(1);
  if (error || !Array.isArray(data)) return "";
  const t = (data[0] as { title?: unknown } | undefined)?.title;
  return typeof t === "string" ? recortarNombre(t) : "";
}

// Id del artículo publicado más reciente (null si no se puede leer o no hay): la guía enseña con él la ficha.
export async function idDeArticuloReciente(): Promise<string | null> {
  const { data, error } = await supabase
    .from("products")
    .select("id")
    .eq("is_active", true)
    .eq("status", "PUBLISHED")
    .order("created_at", { ascending: false })
    .limit(1);
  const id = Array.isArray(data) ? (data[0] as { id?: unknown } | undefined)?.id : null;
  return !error && typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export function EjemplosBuscador({
  ejemplos,
  activo,
  onElegir,
}: {
  ejemplos: EjemploBuscador[];
  activo: number | null;
  onElegir: (i: number | null) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
      {ejemplos.map((e, i) => (
        <Pressable
          key={e.etiqueta}
          onPress={() => onElegir(activo === i ? null : i)}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`Ejemplo: ${e.etiqueta.toLowerCase()}`}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 48,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: activo === i ? COLORS.accent : COLORS.border,
            backgroundColor: activo === i ? COLORS.accentSoft : COLORS.bg,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Ionicons name={e.icono} size={18} color={COLORS.accent} />
          <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13.5 }}>{e.etiqueta}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// Las pestañas del Foro tal como se llaman en su menú (app/(tabs)/chat-global.tsx).
export const PESTANAS_FORO = [
  { nombre: "Foro", corto: "Foro" },
  { nombre: "Noticias Gaming", corto: "Noticias" },
  { nombre: "Nuestras Novedades", corto: "Novedades" },
  { nombre: "Torneos", corto: "Torneos" },
  { nombre: "Chat", corto: "Chat" },
] as const;

// Pulsa de verdad un elemento de la página (la guía tapa la página: no se le puede tocar con el dedo).
export function pulsarEnPagina(el: Element | null | undefined) {
  (el as HTMLElement | null | undefined)?.click?.();
}
// Ojo: las pantallas de las pestañas existen DOS veces en el documento (una oculta): siempre se usa la que se ve.
const seVe = (e: Element) => {
  const r = e.getBoundingClientRect();
  return r.width > 4 && r.height > 4;
};
export const primeroVisible = (selector: string): Element | null =>
  typeof document === "undefined" ? null : Array.from(document.querySelectorAll(selector)).find(seVe) ?? null;
export const botonSelectorForo = () => primeroVisible('[data-testid="selector-pestanas"]');
// El menú del Foro está desplegado cuando se ven sus pestañas.
export const menuForoAbierto = () => !!pestanaDelMenuForo("Torneos");
// La pestaña del menú del Foro con ese nombre (no la de la barra de abajo, que también se llama «Foro»).
export const pestanaDelMenuForo = (nombre: string) =>
  typeof document === "undefined"
    ? null
    : Array.from(document.querySelectorAll("div")).find(
        (n) =>
          n.children.length === 0 &&
          (n.textContent ?? "").trim() === nombre &&
          // ni la barra de abajo ni los botones de la propia tarjeta de la guía, que se llaman igual
          !n.closest('[data-testid^="pestana-"]') &&
          !n.closest("#guia-tarjeta") &&
          seVe(n)
      );

// Fila de 5 botones con las pestañas del Foro: la activa se ilumina mientras la guía las va enseñando; tocar una la abre.
export function ChipsForo({ activa, onElegir }: { activa: number; onElegir: (i: number) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 4, alignSelf: "stretch" }}>
      {PESTANAS_FORO.map((t, i) => (
        <Pressable
          key={t.nombre}
          onPress={() => onElegir(i)}
          accessibilityRole="button"
          accessibilityLabel={`Ver ${t.nombre}`}
          style={({ pressed }) => ({
            // Cada chip mide lo que su nombre (con 13 px de letra «Novedades» no cabe en un quinto del ancho) y se reparten
            // lo que sobra; 44 px de ancho como mínimo para el dedo.
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: "auto",
            minWidth: 44,
            minHeight: 44,
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: i === activa ? COLORS.accent : COLORS.border,
            backgroundColor: i === activa ? COLORS.accent : COLORS.bg,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 2,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text numberOfLines={1} style={{ color: i === activa ? "#FFFFFF" : COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>
            {t.corto}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

type IconoGuia = React.ComponentProps<typeof Ionicons>["name"];
type ItemIcono = { icono: IconoGuia; texto: string };

// Lo que Blue sabe hacer (de su panel: Blue IA, avisos de artículos nuevos, Vender, el equipo y las noticias).
export const CAPACIDADES_BLUE: ItemIcono[] = [
  { icono: "sparkles-outline", texto: "Dudas" },
  { icono: "notifications-outline", texto: "Avisos" },
  { icono: "cash-outline", texto: "Vender" },
  { icono: "people-outline", texto: "Equipo" },
  { icono: "megaphone-outline", texto: "Noticias" },
];
// Los pasos de una compra (app/checkout.tsx): se añade y se reserva, se elige envío o entrega en mano, se paga online
// (tarjeta y, si la página de pago los ofrece, Klarna desde el 2026-11-06 y Bizum desde el 2026-11-11) o se confirma
// sin pagar, y la tienda habla con la persona por el chat.
export const PASOS_DE_COMPRA: ItemIcono[] = [
  { icono: "bag-add-outline", texto: "Añadir" },
  { icono: "time-outline", texto: "Reserva" },
  { icono: "car-outline", texto: "Entrega" },
  { icono: "card-outline", texto: "Pagas" },
  { icono: "chatbubbles-outline", texto: "Chat" },
];
// Gestos de los mensajes del Foro (chat-global.tsx).
export const GESTOS_DEL_FORO: ItemIcono[] = [
  { icono: "happy-outline", texto: "1 toque" },
  { icono: "arrow-undo-outline", texto: "2 toques" },
  { icono: "create-outline", texto: "Escribir" },
];

// Fila de iconos con su nombre debajo; se iluminan uno tras otro (más imagen y menos letras).
export function FilaIconos({ items }: { items: ItemIcono[] }) {
  const [activa, setActiva] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActiva((a) => (a + 1) % items.length), 1300);
    return () => clearInterval(t);
  }, [items.length]);
  return (
    <View style={{ flexDirection: "row", gap: 2, justifyContent: "center", alignItems: "flex-start" }}>
      {items.map((c, i) => (
        <View key={c.texto} style={{ width: 58, alignItems: "center", gap: 3 }}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: i === activa ? COLORS.accent : COLORS.accentSoft,
            }}
          >
            <Ionicons name={c.icono} size={20} color={i === activa ? "#FFFFFF" : COLORS.accent} />
          </View>
          <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>
            {c.texto}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Altura fija de la tarjeta de la guía: así «Siguiente» está SIEMPRE en el mismo sitio y el pulgar no lo busca.
// La tarjeta GRANDE lleva la mascota o los iconos del paso; la COMPACTA (pasos que enseñan otra página: el formulario,
// Perfil, Servicios…) es 80 px más baja para dejar ver la página. Las dos pegadas abajo: «Siguiente» no se mueve.
export const ALTO_TARJETA = 292;
export const ALTO_COMPACTA = 212;
// La compacta con un botón de acción («Ver mis facturas», 44 px) es 44 px más alta: sigue más baja que la grande.
export const ALTO_COMPACTA_ACCION = 256;

// Dónde empieza la tarjeta de la guía cuando no tiene que apartarse (la misma cuenta que hace GuiaBlue más abajo).
const arribaTarjeta = (alto: number) => alto - (Math.round(alto * 0.15) + (Platform.OS === "ios" ? 8 : 0)) - ALTO_TARJETA;

// Cuántos productos de «lo último añadido» caben en el panel del buscador SIN quedar bajo la tarjeta: el panel empieza
// hacia los 78 px, y mide 40 de cabecera, 65 por producto y 45 de «Ver todo el catálogo». Entre 1 y 3.
export const filasBuscadorQueCaben = (alto: number) => limitar(Math.floor((arribaTarjeta(alto) - 6 - (78 + 40 + 45)) / 65), 1, 3);
