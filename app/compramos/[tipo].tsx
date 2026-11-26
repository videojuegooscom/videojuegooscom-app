/**
 * Archivo: app/compramos/[tipo].tsx
 * Función: páginas «Compramos tu…» en /compramos/consolas, /moviles, /portatiles, /pc y /tablets.
 * Para qué sirve: salir en Google cuando alguien de Zaragoza busca vender su consola, móvil, portátil, PC o tablet
 *   (dueño, 2026-11-24: «páginas de categorías: Compramos tu consola, tu iPhone, tu portátil… profesionales»). Cada una
 *   explica cómo se lo compramos y lleva al formulario de venta de siempre (/vender), con el aparato ya escrito.
 * Conectado con: app/vender.tsx y components/VenderAhoraModal.tsx (el formulario; mide los envíos que llegan de aquí),
 *   components/CarruselProductosCategoria.tsx (productosDeCategorias: lo que hay a la venta de ese tipo, con su foto),
 *   tabla categories (las fotos reales de las consolas), components/EtiquetasCabeceraWeb.tsx (título y descripción para
 *   Google), api/sitemap.ts (las 5 direcciones), components/PieDePagina.tsx («Te lo compramos»), lib/analiticaPropia.ts
 *   (compramos_visto, compramos_cta) y components/panel/google.tsx (bloque «Páginas Compramos» en Administración).
 * Dependencias: react, react-native, expo-router, @expo/vector-icons.
 * Estado: ACTIVO
 *
 * Notas:
 * - Las condiciones las dio el dueño el 2026-11-24 y las cambió el 2026-11-26: tasación en menos de 30 minutos, 24/7; en
 *   Zaragoza se recoge en su dirección en menos de 1 hora y en los alrededores (las zonas de entrega del mismo día de
 *   lib/envio.ts) en menos de 1 hora y media, o nos lo acercan; desde otra ciudad, etiqueta
 *   de envío en menos de 2 horas y llega en 72 horas como máximo; se revisa y se paga al momento por Bizum o en efectivo;
 *   si no coincide, se le dice cuánto podemos darle. Etiqueta y devolución sin coste: «como lo hacen las tiendas
 *   profesionales» (dueño). Lo mismo dice Términos y condiciones («Si nos vendes tu aparato»).
 * - Sin precios de compra inventados ni dirección pública (la tienda es solo online).
 * - Las fotos son reales: las de Categorías (consolas) o las de los artículos a la venta de ese tipo. Sin foto, la
 *   cabecera va sin imagen (nada de dibujos).
 * - generateStaticParams: las 5 direcciones existen como páginas en la web publicada (sin una regla en vercel.json,
 *   /compramos/consolas daría 404). El contenido lo pinta el navegador, como en el resto de la tienda (Google lo ejecuta).
 */
import React, { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StatusBar, Text, useWindowDimensions, View } from "react-native";
import { Link, router, useLocalSearchParams, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import CabeceraMarca from "../../components/CabeceraMarca";
import PieDePagina from "../../components/PieDePagina";
import ImagenInteligente from "../../components/ImagenInteligente";
import { FotoEntera } from "../../components/PortadasCategoria";
import { AparecerAlVer, useProgresoDesplazamiento } from "../../components/DesplazamientoSuave";
import CarruselProductosCategoria, { productosDeCategorias, type ProductoEstante } from "../../components/CarruselProductosCategoria";
import { supabase } from "../../lib/supabase";
import { marcarOrigenVender, medirEvento } from "../../lib/analiticaPropia";
import { COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/temaTienda";

const C = {
  bg: "#FFFFFF",
  tile: "#F6FAFD",
  text: COLORES_TEXTO.texto,
  muted: COLORES_TEXTO.secundario,
  line: "#E3EAF2",
  accent: COLORES_TEXTO.azulMarca,
  accentText: COLORES_TEXTO.azulTexto,
  accentSoft: "#EAF6FD",
};

type IconoNombre = React.ComponentProps<typeof Ionicons>["name"];
type Modelo = { nombre: string; texto: string; articulo: string };
export type TipoCompramos = "consolas" | "moviles" | "portatiles" | "pc" | "tablets";
type Pagina = {
  /** Lo que sale en el menú y en «También compramos». */
  corto: string;
  h1: string;
  lema: string;
  icono: IconoNombre;
  /** Lo que se escribe en «¿Qué quieres vender?» al pulsar el botón principal. */
  articulo: string;
  boton: string;
  /** «mi consola», «mi móvil»…: la pregunta la hace el cliente («¿Cuánto me dais por mi consola?»). */
  miAparato: string;
  /** «la» (consola, tablet) o «lo» (móvil, portátil, PC): «te la recogemos», «te lo recogemos». */
  lo: "la" | "lo";
  /** Apartado «¿Quieres vender tu…?» con las palabras que busca la gente en Google (2026-11-25, «vender mi consola»). */
  intro: { titulo: string; texto: string };
  /** Lo que hay a la venta de este tipo: categorías y, si hace falta, palabras del título. */
  categorias: string[];
  filtro: RegExp | null;
  enVenta: string;
  /** Foto real fija de la cabecera (public/compramos/), si la hay: va antes que las de los artículos a la venta. */
  foto?: string;
  modelos: Modelo[];
  revisamos: string[];
  preparar: string[];
};

// Las 7 zonas de entrega del mismo día (lib/envio.ts, ZONAS_MISMO_DIA): las mismas para recoger.
const ZONAS = "Zaragoza, Cuarte de Huerva, Santa Fe, Cadrete, María de Huerva, Muel y La Muela";
const ALREDEDORES = "Cuarte de Huerva, Santa Fe, Cadrete, María de Huerva, Muel y La Muela";

export const PAGINAS_COMPRAMOS: Record<TipoCompramos, Pagina> = {
  consolas: {
    corto: "Consolas",
    h1: "Compramos tu consola en Zaragoza",
    lema: "PlayStation, Nintendo Switch, Xbox y mandos. Tasación en menos de 30 minutos, las 24 horas, y pago al momento.",
    icono: "game-controller-outline",
    articulo: "Consola",
    boton: "Vender mi consola",
    miAparato: "mi consola",
    lo: "la",
    intro: {
      titulo: "¿Quieres vender tu consola?",
      texto:
        "Si buscas dónde vender tu consola, te la compramos: PlayStation 5, PS4, Nintendo Switch, Xbox y mandos. Nos cuentas qué tienes, te la tasamos en menos de 30 minutos, las 24 horas, y te pagamos al momento. En Zaragoza pasamos a recogerla en menos de 1 hora y en los alrededores en menos de 1 hora y media; desde cualquier otra ciudad puedes vender tu consola online, con envío gratis desde toda España.",
    },
    categorias: ["playstation-5", "playstation-4", "nintendo-switch", "xbox"],
    filtro: null,
    enVenta: "Consolas a la venta ahora",
    modelos: [
      { nombre: "PlayStation 5 y PS5 Pro", articulo: "PlayStation 5", texto: "Con lector o digital, Slim y Pro. Mejor precio con su mando DualSense, sus cables y su caja." },
      { nombre: "PlayStation 4 y PS4 Pro", articulo: "PlayStation 4", texto: "Modelos normal, Slim y Pro, también con años de uso o con algún fallo." },
      { nombre: "Nintendo Switch", articulo: "Nintendo Switch", texto: "Switch, Switch OLED y Switch 2, con sus Joy-Con y su base." },
      { nombre: "Xbox Series X y Series S", articulo: "Xbox", texto: "Xbox Series X y Xbox Series S, con su mando." },
      { nombre: "Mandos y accesorios", articulo: "Mando", texto: "DualSense, Joy-Con, mandos Pro, volantes y auriculares para consola." },
    ],
    revisamos: ["Que encienda y dé imagen y sonido", "Los mandos, los puertos HDMI y USB, el wifi y el bluetooth", "El lector de discos y el almacenamiento", "Que no esté bloqueada ni vinculada a otra cuenta"],
    preparar: ["Desvincula tu cuenta de PlayStation, Nintendo o Xbox (o te ayudamos a hacerlo)", "El mando y los cables de corriente y HDMI", "La caja original, si la tienes", "Si tiene algún fallo, cuéntanoslo: también compramos consolas averiadas"],
  },
  moviles: {
    corto: "Móviles",
    h1: "Compramos tu móvil en Zaragoza",
    lema: "iPhone, Samsung Galaxy, Xiaomi, Google Pixel y cualquier Android. Tasación en menos de 30 minutos, las 24 horas, y pago al momento.",
    icono: "phone-portrait-outline",
    articulo: "Móvil",
    boton: "Vender mi móvil",
    miAparato: "mi móvil",
    lo: "lo",
    intro: {
      titulo: "¿Quieres vender tu móvil?",
      texto:
        "Si buscas dónde vender tu móvil, te lo compramos: iPhone, Samsung Galaxy, Xiaomi, Google Pixel y cualquier Android, también con la pantalla rota o con algún fallo. Tasación en menos de 30 minutos, las 24 horas, y pago al momento. En Zaragoza pasamos a recogerlo en menos de 1 hora y en los alrededores en menos de 1 hora y media; desde cualquier otra ciudad puedes vender tu móvil online, con envío gratis desde toda España.",
    },
    categorias: ["electronica"],
    filtro: /iphone|samsung galaxy (?!tab)|galaxy [szamf]\d|xiaomi|redmi|\bpoco\b|pixel|m[oó]vil|smartphone|oppo|huawei|motorola|oneplus/i,
    enVenta: "Móviles a la venta ahora",
    modelos: [
      { nombre: "iPhone", articulo: "iPhone", texto: "Todos los modelos recientes, incluidos los Pro y Pro Max." },
      { nombre: "Samsung Galaxy", articulo: "Samsung Galaxy", texto: "Gama S, gama A y los plegables Z Flip y Z Fold." },
      { nombre: "Xiaomi, Redmi y POCO", articulo: "Xiaomi", texto: "Todas las gamas de Xiaomi, Redmi y POCO." },
      { nombre: "Google Pixel", articulo: "Google Pixel", texto: "Pixel, Pixel Pro y la serie Pixel a." },
      { nombre: "Otros Android", articulo: "Móvil Android", texto: "OPPO, Motorola, OnePlus, Huawei y otras marcas. Consúltanos." },
    ],
    revisamos: ["La pantalla y el táctil, sin manchas ni zonas que no respondan", "La batería (su salud en %) y la carga", "Las cámaras, el altavoz, el micrófono y el Face ID o la huella", "Que no esté bloqueado por iCloud, por la cuenta de Google ni por el operador"],
    preparar: ["Haz una copia de tus datos", "Desactiva «Buscar mi iPhone» o quita tu cuenta de Google (o te ayudamos)", "El cargador y la caja, si los tienes", "Si tiene la pantalla rota o falla algo, cuéntanoslo: también compramos móviles averiados"],
  },
  portatiles: {
    corto: "Portátiles",
    h1: "Compramos tu portátil en Zaragoza",
    lema: "MacBook, portátiles para jugar y portátiles Windows de cualquier marca. Tasación en menos de 30 minutos, las 24 horas, y pago al momento.",
    icono: "laptop-outline",
    articulo: "Portátil",
    boton: "Vender mi portátil",
    miAparato: "mi portátil",
    lo: "lo",
    intro: {
      titulo: "¿Quieres vender tu portátil?",
      texto:
        "Si buscas dónde vender tu portátil, te lo compramos: MacBook Air y MacBook Pro, portátiles para jugar y portátiles Windows de cualquier marca. Tasación en menos de 30 minutos, las 24 horas, y pago al momento. En Zaragoza pasamos a recogerlo en menos de 1 hora y en los alrededores en menos de 1 hora y media; desde cualquier otra ciudad puedes vender tu portátil online, con envío gratis desde toda España.",
    },
    categorias: ["electronica"],
    filtro: /port[aá]til|macbook|laptop|notebook|chromebook|thinkpad|zenbook|vivobook|ideapad|\blegion\b|\bomen\b/i,
    enVenta: "Portátiles a la venta ahora",
    foto: "/compramos/portatiles.jpg",
    modelos: [
      { nombre: "MacBook Air y MacBook Pro", articulo: "MacBook", texto: "Con chip de Apple (M1, M2, M3…) o con Intel." },
      { nombre: "Portátiles para jugar", articulo: "Portátil gaming", texto: "ASUS ROG, Lenovo Legion, MSI, HP Omen y similares, valorados según su tarjeta gráfica." },
      { nombre: "Portátiles Windows", articulo: "Portátil", texto: "HP, Lenovo, Dell, ASUS, Acer y otras marcas, para estudiar o trabajar." },
    ],
    revisamos: ["La pantalla, el teclado y el touchpad", "La batería: sus ciclos y su autonomía", "El procesador, la memoria y el disco", "Que no tenga bloqueos de BIOS, de iCloud ni de empresa"],
    preparar: ["Haz una copia de tus archivos", "Cierra la sesión de tu cuenta de Apple o de Microsoft (o te ayudamos)", "El cargador original, si lo tienes", "Si falla algo, cuéntanoslo: también compramos portátiles averiados"],
  },
  pc: {
    corto: "PC y periféricos",
    h1: "Compramos tu PC y tus periféricos en Zaragoza",
    lema: "Ordenadores de sobremesa, PC gaming, tarjetas gráficas, monitores, teclados y ratones. Tasación en menos de 30 minutos, las 24 horas, y pago al momento.",
    icono: "desktop-outline",
    articulo: "PC",
    boton: "Vender mi PC",
    miAparato: "mi PC",
    lo: "lo",
    intro: {
      titulo: "¿Quieres vender tu PC o tus periféricos?",
      texto:
        "Si buscas dónde vender tu PC, te lo compramos: torres completas o por piezas, PC gaming, tarjetas gráficas, monitores, teclados y ratones. Tasación en menos de 30 minutos, las 24 horas, y pago al momento. En Zaragoza pasamos a recogerlo en menos de 1 hora y en los alrededores en menos de 1 hora y media; desde cualquier otra ciudad puedes vender tu PC o tu gráfica online, con envío gratis desde toda España.",
    },
    categorias: ["electronica"],
    filtro: /\bpc\b|ordenador|monitor|tarjeta gr[aá]fica|\brtx\b|\bgtx\b|radeon|teclado|rat[oó]n|\btorre\b|procesador/i,
    enVenta: "PC y periféricos a la venta ahora",
    foto: "/compramos/pc.jpg",
    modelos: [
      { nombre: "PC gaming y de sobremesa", articulo: "PC de sobremesa", texto: "Torres completas o por piezas, para jugar, trabajar o diseñar." },
      { nombre: "Tarjetas gráficas", articulo: "Tarjeta gráfica", texto: "NVIDIA GeForce RTX y GTX, y AMD Radeon." },
      { nombre: "Monitores", articulo: "Monitor", texto: "Gaming de alta frecuencia, 4K y de oficina." },
      { nombre: "Teclados, ratones y más", articulo: "Periférico", texto: "Teclados mecánicos, ratones, cascos, webcams y micrófonos." },
    ],
    revisamos: ["Que arranque y aguante pruebas de rendimiento y de temperatura", "Los componentes: procesador, gráfica, memoria y discos", "En los monitores, que no haya píxeles muertos ni manchas", "En los periféricos, cada tecla, botón y conexión"],
    preparar: ["Haz una copia de tus archivos y cierra tus cuentas", "La lista de componentes, si la tienes (si no, la sacamos nosotros)", "Los cables de corriente y de vídeo", "La caja original de la gráfica o del monitor, si la tienes"],
  },
  tablets: {
    corto: "iPad y tablets",
    h1: "Compramos tu iPad o tu tablet en Zaragoza",
    lema: "iPad, iPad Air, iPad Pro, iPad mini y tablets Android como la Samsung Galaxy Tab. Tasación en menos de 30 minutos, las 24 horas, y pago al momento.",
    icono: "tablet-portrait-outline",
    articulo: "Tablet",
    boton: "Vender mi tablet",
    miAparato: "mi tablet",
    lo: "la",
    intro: {
      titulo: "¿Quieres vender tu iPad o tu tablet?",
      texto:
        "Si buscas dónde vender tu iPad o tu tablet, te la compramos: iPad, iPad Air, iPad Pro, iPad mini, Samsung Galaxy Tab y otras tablets Android. Tasación en menos de 30 minutos, las 24 horas, y pago al momento. En Zaragoza pasamos a recogerla en menos de 1 hora y en los alrededores en menos de 1 hora y media; desde cualquier otra ciudad puedes vender tu tablet online, con envío gratis desde toda España.",
    },
    categorias: ["electronica"],
    filtro: /ipad|tablet|galaxy tab|xiaomi pad|redmi pad/i,
    enVenta: "iPad y tablets a la venta ahora",
    modelos: [
      { nombre: "iPad", articulo: "iPad", texto: "iPad, iPad Air, iPad mini y iPad Pro, con wifi o con datos." },
      { nombre: "Samsung Galaxy Tab", articulo: "Samsung Galaxy Tab", texto: "Las gamas Galaxy Tab S y Galaxy Tab A." },
      { nombre: "Otras tablets Android", articulo: "Tablet Android", texto: "Xiaomi Pad, Lenovo Tab y otras marcas. Consúltanos." },
      { nombre: "Accesorios", articulo: "Accesorio de tablet", texto: "Apple Pencil, teclados y fundas originales." },
    ],
    revisamos: ["La pantalla y el táctil", "La batería y la carga", "Las cámaras, los altavoces y los botones", "Que no esté bloqueada por iCloud ni por la cuenta de Google"],
    preparar: ["Haz una copia de tus datos", "Desactiva «Buscar mi iPad» o quita tu cuenta de Google (o te ayudamos)", "El cargador, el Apple Pencil o el teclado, si los tienes", "Si falla algo, cuéntanoslo: también compramos tablets averiadas"],
  },
};
const TIPOS = Object.keys(PAGINAS_COMPRAMOS) as TipoCompramos[];
const QUE_COMPRAMOS: Record<TipoCompramos, string> = {
  consolas: "Qué consolas compramos",
  moviles: "Qué móviles compramos",
  portatiles: "Qué portátiles compramos",
  pc: "Qué PC y periféricos compramos",
  tablets: "Qué iPad y tablets compramos",
};

/** Las fotos propias de una página (site_settings.compramos_fotos[tipo]): solo direcciones https, como mucho 10. */
export function fotosDePagina(valor: unknown, tipo: string): string[] {
  const lista = valor && typeof valor === "object" ? (valor as Record<string, unknown>)[tipo] : null;
  return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string" && /^https:\/\//.test(x)).slice(0, 10) : [];
}
export const MAX_FOTOS_COMPRAMOS = 10;

/** Las 5 direcciones se crean al publicar la web. */
export async function generateStaticParams(): Promise<{ tipo: string }[]> {
  return TIPOS.map((tipo) => ({ tipo }));
}

// Tasación en menos de 30 minutos, 24/7; recogida en Zaragoza en menos de 1 hora y en los alrededores en menos de 1 hora
// y media (dueño, 2026-11-26).
const SELLOS: { icono: IconoNombre; texto: string }[] = [
  { icono: "time-outline", texto: "Tasación en menos de 30 minutos, 24/7" },
  { icono: "car-outline", texto: "Recogida en Zaragoza en menos de 1 hora" },
  { icono: "cube-outline", texto: "Envío gratis desde toda España" },
  { icono: "cash-outline", texto: "Pago al momento: Bizum o efectivo" },
];

const PASO_FORMULARIO = {
  titulo: "Cuéntanos qué tienes",
  texto: "Rellena el formulario y completa cada apartado obligatorio. Para que la tasación sea más precisa, completa también los opcionales.",
};
const PASO_TASACION = {
  titulo: "Te lo tasamos en menos de 30 minutos",
  texto: "Las 24 horas, los 7 días de la semana. Te enviamos nuestra oferta por el chat de la tienda o por correo.",
};
const PASOS_ZARAGOZA = [
  PASO_FORMULARIO,
  PASO_TASACION,
  { titulo: "Lo recogemos en menos de 1 hora", texto: "En tu dirección de Zaragoza en menos de 1 hora, y en los alrededores en menos de 1 hora y media. O nos lo acercas tú." },
  { titulo: "Lo comprobamos y te pagamos", texto: "Comprobamos que todo esté como indicaste en el formulario y te pagamos al momento por Bizum o en efectivo." },
];
const PASOS_ESPANA = [
  PASO_FORMULARIO,
  PASO_TASACION,
  { titulo: "Etiqueta gratis en menos de 2 horas", texto: "Te enviamos una etiqueta prepagada: solo tienes que embalarlo y entregarlo." },
  { titulo: "Nos llega en 72 horas como máximo", texto: "Puedes seguir el envío en todo momento." },
  { titulo: "Lo comprobamos y te pagamos", texto: "Comprobamos que todo esté como indicaste en el formulario y te pagamos al momento por Bizum. Si no, te hacemos una nueva oferta y, si no la aceptas, te lo devolvemos gratis." },
];

export function preguntas(p: Pagina): { q: string; a: string }[] {
  return [
    // Las dos primeras, con las palabras que busca la gente en Google (2026-11-25).
    { q: `¿Dónde vender ${p.miAparato} en Zaragoza?`, a: `Aquí: te ${p.lo} compramos y pasamos a recoger${p.lo} a tu dirección en menos de 1 hora (en los alrededores, en menos de 1 hora y media), o nos ${p.lo} acercas tú. Te ${p.lo} tasamos en menos de 30 minutos, las 24 horas, y te pagamos al momento por Bizum o en efectivo.` },
    { q: `¿Puedo vender ${p.miAparato} online desde otra ciudad?`, a: `Sí, desde cualquier punto de España. Te enviamos una etiqueta prepagada en menos de 2 horas, nos llega en 72 horas como máximo y, cuando ${p.lo} revisamos, te pagamos al momento por Bizum.` },
    { q: `¿Cuánto me dais por ${p.miAparato}?`, a: "Depende del modelo, de su estado y de lo que incluya (caja, cargador, accesorios). Rellena el formulario con sus fotos (cuantos más apartados completes, más precisa será la tasación) y te haremos una oferta en menos de 30 minutos, las 24 horas, sin compromiso." },
    { q: "¿Lo compráis aunque esté averiado?", a: "Sí. Indícanos qué le ocurre y te haremos una oferta igualmente: como también nos dedicamos a la reparación, sabemos valorarlo." },
    { q: "¿Cómo me pagáis?", a: "Al momento, en cuanto lo hemos revisado: por Bizum o en efectivo. Si nos lo envías desde otra ciudad, por Bizum. Firmamos un contrato de compraventa para que todo quede por escrito." },
    { q: "¿Dónde lo recogéis?", a: `En tu dirección de Zaragoza, en menos de 1 hora; en ${ALREDEDORES}, en menos de 1 hora y media. También nos lo puedes acercar tú. Desde el resto de España te enviamos una etiqueta prepagada sin coste.` },
    { q: "¿Qué pasa si al revisarlo no coincide con lo que indiqué?", a: "Te explicamos lo que hemos encontrado y te hacemos una nueva oferta. Si no la aceptas, te lo devolvemos sin coste." },
    { q: "¿Puedo cambiarlo por otro artículo de la tienda?", a: "Sí. Puedes usar su valor para llevarte otro artículo del catálogo; indícalo en el formulario." },
    { q: "¿Qué necesito para venderlo?", a: "Ser mayor de edad y el propietario del aparato." },
  ];
}

// --- Para Google (2026-11-25, «adelante 1, 2, 3») ---------------------------------------------------------------------
const DOMINIO_WEB = "https://videojuegoszaragoza.com";

/**
 * Datos estructurados de la página (schema.org): el servicio «compramos …» de la tienda (zona: Zaragoza y toda España),
 * sus preguntas frecuentes y la ruta Inicio › Compramos. Los usan el HTML ya generado (app/_layout.tsx) y la página al
 * pintarse (un <script> en el <head>). Solo datos de la propia página.
 */
export function datosEstructuradosCompramos(tipo: TipoCompramos): Record<string, unknown> {
  const p = PAGINAS_COMPRAMOS[tipo];
  const url = `${DOMINIO_WEB}/compramos/${tipo}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `${url}#servicio`,
        name: p.h1,
        serviceType: `Compra de ${p.corto.toLowerCase()} de segunda mano`,
        description: `${p.lema} ${p.intro.texto}`,
        url,
        provider: { "@id": `${DOMINIO_WEB}/#tienda` },
        areaServed: [
          { "@type": "City", name: "Zaragoza" },
          { "@type": "Country", name: "España" },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#preguntas`,
        mainEntity: preguntas(p).map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: `${DOMINIO_WEB}/` },
          { "@type": "ListItem", position: 2, name: `Compramos: ${p.corto}`, item: url },
        ],
      },
    ],
  };
}
/** En JSON dentro de <script>: «<» escapado para que ningún texto pueda cerrar la etiqueta. */
export const jsonSeguro = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");

/**
 * El texto de la página en el HTML que se genera al publicar (app/_layout.tsx lo pinta debajo de la pantalla de carga):
 * así Google lo lee sin esperar a que arranque la tienda. Es el mismo texto que enseña la página (no hay nada que el
 * cliente no vea) y desaparece en cuanto la tienda se pinta, sin moverse nada a la vista.
 */
export function VistaEstaticaCompramos({ tipo }: { tipo: TipoCompramos }) {
  const p = PAGINAS_COMPRAMOS[tipo];
  const nivel = (n: number) => ({ accessibilityRole: "header" as const, ...({ "aria-level": n } as object) });
  return (
    <View nativeID="compramos-estatica" style={{ padding: 16, gap: 8 }}>
      <Text {...nivel(1)}>{p.h1}</Text>
      <Text>{p.lema}</Text>
      <Text>{SELLOS.map((s) => s.texto).join(" · ")}</Text>
      <Text {...nivel(2)}>{p.intro.titulo}</Text>
      <Text>{p.intro.texto}</Text>
      <Text {...nivel(2)}>{QUE_COMPRAMOS[tipo]}</Text>
      {p.modelos.map((m) => (
        <Text key={m.nombre}>
          {m.nombre}: {m.texto}
        </Text>
      ))}
      <Text {...nivel(2)}>Cómo funciona</Text>
      <Text>En Zaragoza y alrededores: {PASOS_ZARAGOZA.map((s) => `${s.titulo}. ${s.texto}`).join(" ")}</Text>
      <Text>Desde el resto de España: {PASOS_ESPANA.map((s) => `${s.titulo}. ${s.texto}`).join(" ")}</Text>
      <Text {...nivel(2)}>Preguntas frecuentes</Text>
      {preguntas(p).map((f) => (
        <Text key={f.q}>
          {f.q} {f.a}
        </Text>
      ))}
      <Text>
        También compramos:{" "}
        {TIPOS.filter((t) => t !== tipo).map((t, i) => (
          <Text key={t} {...({ href: `/compramos/${t}` } as object)}>
            {i ? ", " : ""}
            {PAGINAS_COMPRAMOS[t].corto}
          </Text>
        ))}
      </Text>
    </View>
  );
}

/** ¿Es una dirección «Compramos» (y cuál)? Para app/_layout.tsx. */
export function tipoCompramosDeRuta(ruta: string | null | undefined): TipoCompramos | null {
  const m = /^\/compramos\/([a-z]+)\/?$/.exec(ruta ?? "");
  return m && (TIPOS as string[]).includes(m[1]) ? (m[1] as TipoCompramos) : null;
}

function H2({ children, nativeID }: { children: string; nativeID?: string }) {
  return (
    <Text nativeID={nativeID} accessibilityRole="header" {...({ "aria-level": 2 } as object)} style={{ color: C.text, fontWeight: "900", fontSize: TAMANOS.titulo2 - 2, lineHeight: 30, textAlign: "center" }}>
      {children}
    </Text>
  );
}

function Boton({ texto, icono, onPress, principal, nativeID }: { texto: string; icono: IconoNombre; onPress: () => void; principal?: boolean; nativeID?: string }) {
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: 52,
        paddingHorizontal: 22,
        borderRadius: 999,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: principal ? C.accent : C.bg,
        borderWidth: principal ? 0 : 1,
        borderColor: C.line,
        opacity: pressed ? 0.88 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <Ionicons name={icono} size={19} color={principal ? "#FFFFFF" : C.accent} />
      <Text style={{ color: principal ? "#FFFFFF" : C.text, fontWeight: "900", fontSize: TAMANOS.cuerpo + 1 }}>{texto}</Text>
    </Pressable>
  );
}

// Una tarjeta con lista (pasos numerados o marcas de verificación), todo centrado como «Quiénes somos» (dueño,
// 2026-11-25: «centra el texto y botones y todo, siguiendo siempre nuestro diseño»): el icono o el número encima.
function TarjetaLista({ titulo, subtitulo, icono, filas, numerada, ancho, nativeID }: { titulo: string; subtitulo?: string; icono: IconoNombre; filas: { titulo: string; texto?: string }[]; numerada?: boolean; ancho: `${number}%`; nativeID?: string }) {
  return (
    <View nativeID={nativeID} style={{ flexGrow: 1, flexShrink: 1, flexBasis: ancho, minWidth: 0, backgroundColor: C.tile, borderRadius: 20, padding: 22, gap: 18, alignItems: "center" }}>
      <View style={{ alignItems: "center", gap: 8 }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: C.accentSoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icono} size={22} color={C.accent} />
        </View>
        <Text accessibilityRole="header" {...({ "aria-level": 3 } as object)} style={{ color: C.text, fontWeight: "900", fontSize: TAMANOS.destacado, textAlign: "center" }}>
          {titulo}
        </Text>
        {subtitulo ? <Text style={{ color: C.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center", maxWidth: 420 }}>{subtitulo}</Text> : null}
      </View>
      {filas.map((f, i) => (
        <View key={f.titulo} style={{ alignItems: "center", gap: 6, maxWidth: 440 }}>
          {numerada ? (
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: TAMANOS.minimo }}>{i + 1}</Text>
            </View>
          ) : (
            <Ionicons name="checkmark-circle" size={22} color={C.accent} />
          )}
          <Text style={{ color: C.text, fontWeight: f.texto ? "900" : "700", fontSize: TAMANOS.cuerpo, lineHeight: 21, textAlign: "center" }}>{f.titulo}</Text>
          {f.texto ? <Text style={{ color: C.muted, fontSize: TAMANOS.cuerpo - 1, lineHeight: 20, textAlign: "center" }}>{f.texto}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export default function CompramosScreen() {
  const { tipo: tipoParam } = useLocalSearchParams<{ tipo?: string }>();
  const tipo = (TIPOS as string[]).includes(String(tipoParam)) ? (String(tipoParam) as TipoCompramos) : null;
  const p = tipo ? PAGINAS_COMPRAMOS[tipo] : null;
  const { width } = useWindowDimensions();
  const ancho = width > 0 ? width : 1024;
  const isMobile = ancho < 700;
  const ancho2 = isMobile ? "100%" : "48%";
  const ancho3 = isMobile ? "100%" : ancho >= 1000 ? "31%" : "48%";
  const [enVenta, setEnVenta] = useState<ProductoEstante[] | null>(null);
  const [fotosConsolas, setFotosConsolas] = useState<string[]>([]);
  // Fotos propias que pone el dueño en Administración → Google → «Fotos» (site_settings.compramos_fotos, hasta 10).
  const [fotosPropias, setFotosPropias] = useState<string[]>([]);
  const [verFoto, setVerFoto] = useState(0);
  const progresoScroll = useProgresoDesplazamiento();

  // Lo que hay a la venta de este tipo, las fotos propias y, en Consolas, las fotos reales de Categorías.
  useEffect(() => {
    if (!tipo || !p) return;
    let vivo = true;
    void medirEvento("compramos_visto", `Compramos: ${p.corto}`, { path: `/compramos/${tipo}`, metadata: { pagina: tipo } });
    void productosDeCategorias(p.categorias, p.filtro).then((l) => vivo && setEnVenta(l));
    // Sin la columna (migración sin aplicar) da error y se quedan las de siempre.
    void supabase
      .from("site_settings")
      .select("compramos_fotos")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vivo || error) return;
        setFotosPropias(fotosDePagina((data as { compramos_fotos?: unknown } | null)?.compramos_fotos, tipo));
      });
    if (tipo === "consolas") {
      void supabase
        .from("categories")
        .select("slug,image_url")
        .in("slug", p.categorias)
        .then(({ data }) => {
          if (!vivo || !Array.isArray(data)) return;
          const orden = (s: string) => p.categorias.indexOf(s);
          setFotosConsolas((data as { slug: string; image_url: string | null }[]).filter((c) => !!c.image_url).sort((a, b) => orden(a.slug) - orden(b.slug)).map((c) => String(c.image_url)));
        });
    }
    return () => {
      vivo = false;
    };
  }, [tipo, p]);

  // Datos estructurados para Google en el <head> mientras se ve la página (el HTML generado ya los trae; al arrancar la
  // tienda, la cabecera generada se quita y aquí se vuelven a poner, para que Google los vea también en la página pintada).
  useEffect(() => {
    if (!tipo || Platform.OS !== "web" || typeof document === "undefined") return;
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.id = "compramos-datos";
    s.text = jsonSeguro(datosEstructuradosCompramos(tipo));
    document.head.appendChild(s);
    return () => s.remove();
  }, [tipo]);

  // Con varias fotos propias, pasan solas cada 5 s (las flechas también las cambian).
  useEffect(() => {
    setVerFoto(0);
    if (fotosPropias.length < 2) return;
    const t = setInterval(() => setVerFoto((i) => (i + 1) % fotosPropias.length), 5000);
    return () => clearInterval(t);
  }, [fotosPropias]);

  if (!tipo || !p) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, padding: 24, alignItems: "center", justifyContent: "center", gap: 16 }}>
        <Text style={{ color: C.text, fontWeight: "900", fontSize: TAMANOS.titulo3, textAlign: "center" }}>Esta página no existe</Text>
        <Boton texto="Vender mi artículo" icono="cash-outline" principal onPress={() => router.replace("/vender")} />
      </View>
    );
  }

  const vender = (articulo: string, desde: string) => {
    marcarOrigenVender(`compramos-${tipo}`, 120);
    void medirEvento("compramos_cta", `Compramos: Vender (${p.corto})`, { path: `/compramos/${tipo}`, metadata: { pagina: tipo, desde } });
    router.push({ pathname: "/vender", params: { articulo } });
  };
  // Fotos reales de la cabecera: las de Categorías (consolas) o las de lo que hay a la venta de este tipo.
  // Con foto fija (portátiles y PC, foto real de Pexels que eligió el dueño el 2026-11-24), solo esa.
  const fotos = p.foto ? [p.foto] : (tipo === "consolas" ? fotosConsolas : (enVenta ?? []).map((x) => x.image).filter((x): x is string => !!x)).slice(0, 4);
  const padding = isMobile ? 16 : 28;
  const flechaFoto = (signo: "‹" | "›", nombre: string, paso: number, lado: "left" | "right") => (
    <Pressable
      nativeID={`compramos-foto-${paso < 0 ? "anterior" : "siguiente"}`}
      onPress={() => setVerFoto((i) => (i + paso + fotosPropias.length) % fotosPropias.length)}
      accessibilityRole="button"
      accessibilityLabel={nombre}
      style={({ pressed }) => ({ position: "absolute", top: "50%", [lado]: 10, marginTop: -22, width: TACTIL.minimo, height: TACTIL.minimo, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.88)", alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
    >
      <Text style={{ color: C.text, fontSize: 26, fontWeight: "900", lineHeight: 28 }}>{signo}</Text>
    </Pressable>
  );
  // Fotos propias: una a una, con flechas y puntos; si no, las de siempre (hasta 4 en mosaico).
  const cabeceraPropias = fotosPropias.length ? (
    <View nativeID="compramos-fotos" style={{ flexGrow: 1, flexShrink: 1, flexBasis: isMobile ? "100%" : "40%", minWidth: 0, gap: 10 }}>
      <View style={{ width: "100%", aspectRatio: isMobile ? 4 / 3 : 1, borderRadius: 24, overflow: "hidden", backgroundColor: C.tile }}>
        <ImagenInteligente uri={fotosPropias[verFoto] ?? fotosPropias[0]} ancho={isMobile ? 360 : 520} priority="high" transitionMs={400} alt={`${p.corto} que compramos en Zaragoza`} style={{ width: "100%", height: "100%" }} />
        {fotosPropias.length > 1 ? (
          <>
            {flechaFoto("‹", "Foto anterior", -1, "left")}
            {flechaFoto("›", "Foto siguiente", 1, "right")}
          </>
        ) : null}
      </View>
      {fotosPropias.length > 1 ? (
        <View nativeID="compramos-foto-puntos" accessibilityLabel={`Foto ${verFoto + 1} de ${fotosPropias.length}`} style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
          {fotosPropias.map((f, i) => (
            <View key={f} style={{ width: i === verFoto ? 18 : 7, height: 7, borderRadius: 4, backgroundColor: i === verFoto ? C.accent : C.line }} />
          ))}
        </View>
      ) : null}
    </View>
  ) : null;

  const cabeceraTexto = (
    // Todo centrado, como «Quiénes somos» (dueño, 2026-11-25).
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: isMobile ? "100%" : "52%", minWidth: 0, gap: 16, justifyContent: "center", alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Ionicons name={p.icono} size={18} color={C.accentText} />
        <Text style={{ color: C.accentText, fontWeight: "900", fontSize: TAMANOS.minimo, letterSpacing: 1, textTransform: "uppercase" }}>Te lo compramos</Text>
      </View>
      <Text nativeID="compramos-h1" accessibilityRole="header" {...({ "aria-level": 1 } as object)} style={{ color: C.text, fontWeight: "900", fontSize: isMobile ? 30 : 40, lineHeight: isMobile ? 36 : 47, textAlign: "center" }}>
        {p.h1}
      </Text>
      <Text style={{ color: C.muted, fontSize: isMobile ? 16 : 18, lineHeight: isMobile ? 24 : 27, textAlign: "center", maxWidth: 560 }}>{p.lema}</Text>
      <View nativeID="compramos-sellos" style={{ width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {SELLOS.map((s) => (
          <View key={s.texto} style={{ flexGrow: 1, flexBasis: "45%", minWidth: 0, alignItems: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14, backgroundColor: C.tile }}>
            <Ionicons name={s.icono} size={20} color={C.accent} />
            <Text style={{ color: C.text, fontWeight: "800", fontSize: isMobile ? TAMANOS.minimo + 0.5 : TAMANOS.cuerpo - 1, lineHeight: isMobile ? 18 : 19, textAlign: "center" }}>{s.texto}</Text>
          </View>
        ))}
      </View>
      <View style={{ width: "100%", flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 4 }}>
        <View style={{ flexGrow: isMobile ? 1 : 0 }}>
          <Boton nativeID="compramos-vender" texto={p.boton} icono="cash-outline" principal onPress={() => vender(p.articulo, "cabecera")} />
        </View>
        <View style={{ flexGrow: isMobile ? 1 : 0 }}>
          <Boton nativeID="compramos-hablar" texto="Hablar con nosotros" icono="chatbubbles-outline" onPress={() => router.push("/blue-ia")} />
        </View>
      </View>
    </View>
  );

  const cabeceraFoto = fotos.length ? (
    <View nativeID="compramos-fotos" style={{ flexGrow: 1, flexShrink: 1, flexBasis: isMobile ? "100%" : "40%", minWidth: 0 }}>
      <View style={{ width: "100%", aspectRatio: isMobile ? 4 / 3 : 1, borderRadius: 24, overflow: "hidden", backgroundColor: C.tile, flexDirection: "row", flexWrap: "wrap" }}>
        {fotos.map((f, i) => (
          <View key={f} style={{ width: fotos.length === 1 ? "100%" : "50%", height: fotos.length <= 2 ? "100%" : "50%", padding: fotos.length === 1 ? 0 : 3 }}>
            {fotos.length === 1 ? (
              <ImagenInteligente uri={f} ancho={isMobile ? 360 : 480} priority="high" alt={`${p.corto} que compramos en Zaragoza`} style={{ width: "100%", height: "100%" }} />
            ) : (
              // En el mosaico, cada foto entera (dueño, 2026-11-26: «que se vea el producto y su nombre»): sin recortar,
              // con la misma foto desenfocada detrás, como las portadas «enteras» de Inicio.
              <FotoEntera uri={f} ancho={isMobile ? 360 : 480} prioridad={i === 0 ? "high" : "normal"} alt={`${p.corto} que compramos en Zaragoza`} style={{ width: "100%", height: "100%", borderRadius: 18 }} />
            )}
          </View>
        ))}
      </View>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView {...progresoScroll.propsScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: padding, paddingTop: isMobile ? 12 : 14 }}>
        <View style={{ width: "100%", maxWidth: 1120, alignSelf: "center", gap: isMobile ? 36 : 52 }}>
          <View style={{ gap: isMobile ? 14 : 22 }}>
            <CabeceraMarca />
            {/* Cabecera: el texto y el botón primero; la foto, a la derecha en el ordenador y debajo en el móvil. */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: isMobile ? 20 : 40, alignItems: "center" }}>
              {cabeceraTexto}
              {cabeceraPropias ?? cabeceraFoto}
            </View>
          </View>

          {/* «¿Quieres vender tu…?»: con las palabras que busca la gente en Google (2026-11-25). */}
          <AparecerAlVer nativeID="compramos-intro" style={{ width: "100%", alignItems: "center", gap: 10 }}>
            <H2>{p.intro.titulo}</H2>
            <Text style={{ color: C.muted, fontSize: TAMANOS.cuerpo + 1, lineHeight: 25, textAlign: "center", maxWidth: 720 }}>{p.intro.texto}</Text>
          </AparecerAlVer>

          {/* Cada apartado aparece con el fundido suave de Inicio al llegar a él (dueño, 2026-11-25: «que el scroll sea
              igual que en la página de inicio»). Siempre con width: "100%" (lección de las envolturas). */}
          <AparecerAlVer nativeID="compramos-modelos" style={{ width: "100%", gap: 16 }}>
            <H2>{QUE_COMPRAMOS[tipo]}</H2>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {p.modelos.map((m) => (
                <Pressable
                  key={m.nombre}
                  onPress={() => vender(m.articulo, "modelo")}
                  accessibilityRole="button"
                  accessibilityLabel={`Vender ${m.nombre}`}
                  style={({ pressed }) => ({ flexGrow: 1, flexShrink: 1, flexBasis: ancho3, minWidth: 0, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg, padding: 20, gap: 8, alignItems: "center", opacity: pressed ? 0.85 : 1 })}
                >
                  <Text accessibilityRole="header" {...({ "aria-level": 3 } as object)} style={{ color: C.text, fontWeight: "900", fontSize: TAMANOS.destacado, textAlign: "center" }}>
                    {m.nombre}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: TAMANOS.cuerpo - 1, lineHeight: 20, flexGrow: 1, textAlign: "center" }}>{m.texto}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <Text style={{ color: C.accentText, fontWeight: "900", fontSize: TAMANOS.cuerpo - 1 }}>Pedir precio</Text>
                    <Ionicons name="arrow-forward" size={16} color={C.accentText} />
                  </View>
                </Pressable>
              ))}
            </View>
          </AparecerAlVer>

          <AparecerAlVer nativeID="compramos-como" style={{ width: "100%", gap: 16 }}>
            <H2>Cómo funciona</H2>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <TarjetaLista nativeID="compramos-zaragoza" titulo="En Zaragoza y alrededores" subtitulo={ZONAS} icono="location-outline" filas={PASOS_ZARAGOZA} numerada ancho={ancho2} />
              <TarjetaLista nativeID="compramos-espana" titulo="Desde el resto de España" subtitulo="Con envío gratis" icono="map-outline" filas={PASOS_ESPANA} numerada ancho={ancho2} />
            </View>
          </AparecerAlVer>

          <AparecerAlVer style={{ width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <TarjetaLista titulo="Qué revisamos" icono="shield-checkmark-outline" filas={p.revisamos.map((t) => ({ titulo: t }))} ancho={ancho2} />
            <TarjetaLista titulo="Qué tener preparado" icono="list-outline" filas={p.preparar.map((t) => ({ titulo: t }))} ancho={ancho2} />
          </AparecerAlVer>

          {enVenta && enVenta.length ? (
            <AparecerAlVer style={{ width: "100%" }}>
              <CarruselProductosCategoria nativeID="compramos-a-la-venta" titulo={p.enVenta} productos={enVenta} sinMovimiento onTocar={(id) => void medirEvento("compramos_producto", `Compramos: producto (${p.corto})`, { metadata: { pagina: tipo, id } })} />
            </AparecerAlVer>
          ) : null}

          <AparecerAlVer nativeID="compramos-preguntas" style={{ width: "100%", gap: 12 }}>
            <H2>Preguntas frecuentes</H2>
            <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 28, rowGap: 0 }}>
              {preguntas(p).map((f) => (
                <View key={f.q} style={{ flexGrow: 1, flexShrink: 1, flexBasis: ancho2, minWidth: 0, gap: 4, paddingVertical: 16, borderTopWidth: 1, borderTopColor: C.line, alignItems: "center" }}>
                  <Text accessibilityRole="header" {...({ "aria-level": 3 } as object)} style={{ color: C.text, fontWeight: "900", fontSize: TAMANOS.cuerpo + 1, lineHeight: 22, textAlign: "center" }}>
                    {f.q}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: TAMANOS.cuerpo, lineHeight: 22, textAlign: "center", maxWidth: 480 }}>{f.a}</Text>
                </View>
              ))}
            </View>
          </AparecerAlVer>

          {/* Llamada final y el resto de páginas «Compramos» (enlaces de verdad, para Google). */}
          <AparecerAlVer nativeID="compramos-final" style={{ width: "100%", borderRadius: 28, backgroundColor: C.text, padding: isMobile ? 22 : 36, gap: 16, alignItems: "center" }}>
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: isMobile ? 24 : 30, lineHeight: isMobile ? 30 : 36, textAlign: "center" }}>¿Te damos precio?</Text>
            <Text style={{ color: "rgba(255,255,255,0.82)", fontSize: TAMANOS.cuerpo + 1, lineHeight: 24, textAlign: "center", maxWidth: 560 }}>
              Cuéntanos qué tienes y en menos de 30 minutos, las 24 horas, recibirás nuestra oferta, sin compromiso.
            </Text>
            <Boton nativeID="compramos-vender-final" texto={p.boton} icono="cash-outline" principal onPress={() => vender(p.articulo, "final")} />
          </AparecerAlVer>

          <AparecerAlVer nativeID="compramos-otras" style={{ width: "100%", gap: 12, alignItems: "center" }}>
            <Text style={{ color: C.text, fontWeight: "900", fontSize: TAMANOS.destacado }}>También compramos</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
              {TIPOS.filter((t) => t !== tipo).map((t) => (
                <Link key={t} href={`/compramos/${t}` as Href} asChild>
                  <Pressable accessibilityRole="link" style={{ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg }}>
                    <Ionicons name={PAGINAS_COMPRAMOS[t].icono} size={18} color={C.accent} />
                    <Text style={{ color: C.text, fontWeight: "800", fontSize: TAMANOS.cuerpo - 1 }}>{PAGINAS_COMPRAMOS[t].corto}</Text>
                  </Pressable>
                </Link>
              ))}
            </View>
          </AparecerAlVer>

          <PieDePagina sidePadding={padding} contentMaxWidth={640} />
        </View>
        {Platform.OS === "web" ? <View style={{ height: 72 }} /> : null}
      </ScrollView>
      {progresoScroll.barra}
    </View>
  );
}
