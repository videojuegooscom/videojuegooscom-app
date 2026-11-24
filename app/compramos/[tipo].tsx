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
 * - Las condiciones las dio el dueño el 2026-11-24: precio en menos de 1 hora; en Zaragoza y alrededores (las zonas de
 *   entrega del mismo día de lib/envio.ts) se recoge o nos lo acercan en menos de 2 horas; desde otra ciudad, etiqueta
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
  /** «tu consola», «tu móvil»…, para las preguntas. */
  tuAparato: string;
  /** Lo que hay a la venta de este tipo: categorías y, si hace falta, palabras del título. */
  categorias: string[];
  filtro: RegExp | null;
  enVenta: string;
  modelos: Modelo[];
  revisamos: string[];
  preparar: string[];
};

// Las 7 zonas de entrega del mismo día (lib/envio.ts, ZONAS_MISMO_DIA): las mismas para recoger.
const ZONAS = "Zaragoza, Cuarte de Huerva, Santa Fe, Cadrete, María de Huerva, Muel y La Muela";

export const PAGINAS_COMPRAMOS: Record<TipoCompramos, Pagina> = {
  consolas: {
    corto: "Consolas",
    h1: "Compramos tu consola en Zaragoza",
    lema: "PlayStation, Nintendo Switch, Xbox, mandos y consolas retro. Te damos precio en menos de 1 hora y te pagamos al momento.",
    icono: "game-controller-outline",
    articulo: "Consola",
    boton: "Vender mi consola",
    tuAparato: "tu consola",
    categorias: ["playstation-5", "playstation-4", "nintendo-switch", "xbox"],
    filtro: null,
    enVenta: "Consolas a la venta ahora",
    modelos: [
      { nombre: "PlayStation 5 y PS5 Pro", articulo: "PlayStation 5", texto: "Con lector o digital, Slim y Pro. Mejor precio con su mando DualSense, sus cables y su caja." },
      { nombre: "PlayStation 4 y PS4 Pro", articulo: "PlayStation 4", texto: "Normal, Slim y Pro, aunque tenga años: también si se calienta o hace ruido." },
      { nombre: "Nintendo Switch", articulo: "Nintendo Switch", texto: "Switch, Switch OLED, Switch Lite y Switch 2, con sus Joy-Con y su base." },
      { nombre: "Xbox Series y Xbox One", articulo: "Xbox", texto: "Xbox Series X, Xbox Series S y Xbox One, con su mando." },
      { nombre: "Mandos y accesorios", articulo: "Mando", texto: "DualSense, Joy-Con, mandos Pro, volantes y auriculares para consola." },
      { nombre: "Consolas retro", articulo: "Consola retro", texto: "PlayStation 2 y 3, Wii, Nintendo DS y 3DS, Game Boy y otras clásicas." },
    ],
    revisamos: ["Que encienda y dé imagen y sonido", "Los mandos, los puertos HDMI y USB, el wifi y el bluetooth", "El lector de discos y el almacenamiento", "Que no esté bloqueada ni vinculada a otra cuenta"],
    preparar: ["Desvincula tu cuenta de PlayStation, Nintendo o Xbox (o te ayudamos a hacerlo)", "El mando y los cables de corriente y HDMI", "La caja original, si la tienes", "Si tiene algún fallo, cuéntanoslo: también compramos consolas averiadas"],
  },
  moviles: {
    corto: "Móviles",
    h1: "Compramos tu móvil en Zaragoza",
    lema: "iPhone, Samsung Galaxy, Xiaomi, Google Pixel y cualquier Android. Te damos precio en menos de 1 hora y te pagamos al momento.",
    icono: "phone-portrait-outline",
    articulo: "Móvil",
    boton: "Vender mi móvil",
    tuAparato: "tu móvil",
    categorias: ["electronica"],
    filtro: /iphone|samsung galaxy (?!tab)|galaxy [szamf]\d|xiaomi|redmi|\bpoco\b|pixel|m[oó]vil|smartphone|oppo|huawei|motorola|oneplus/i,
    enVenta: "Móviles a la venta ahora",
    modelos: [
      { nombre: "iPhone", articulo: "iPhone", texto: "Todos los modelos recientes, también los Pro y Pro Max, libres de operador." },
      { nombre: "Samsung Galaxy", articulo: "Samsung Galaxy", texto: "Gama S, gama A y los plegables Z Flip y Z Fold." },
      { nombre: "Xiaomi, Redmi y POCO", articulo: "Xiaomi", texto: "Los modelos de Xiaomi, Redmi y POCO, con su cargador si lo tienes." },
      { nombre: "Google Pixel", articulo: "Google Pixel", texto: "Pixel, Pixel Pro y Pixel serie a." },
      { nombre: "Otros Android", articulo: "Móvil Android", texto: "OPPO, Motorola, OnePlus, Huawei y otras marcas: pregúntanos." },
    ],
    revisamos: ["La pantalla y el táctil, sin manchas ni zonas que no respondan", "La batería (su salud en %) y la carga", "Las cámaras, el altavoz, el micrófono y el Face ID o la huella", "Que no esté bloqueado por iCloud, por la cuenta de Google ni por el operador"],
    preparar: ["Haz una copia de tus datos", "Desactiva «Buscar mi iPhone» o quita tu cuenta de Google (o te ayudamos)", "El cargador y la caja, si los tienes", "Si tiene la pantalla rota o falla algo, cuéntanoslo: también compramos móviles averiados"],
  },
  portatiles: {
    corto: "Portátiles",
    h1: "Compramos tu portátil en Zaragoza",
    lema: "MacBook, portátiles para jugar y portátiles Windows de cualquier marca. Te damos precio en menos de 1 hora y te pagamos al momento.",
    icono: "laptop-outline",
    articulo: "Portátil",
    boton: "Vender mi portátil",
    tuAparato: "tu portátil",
    categorias: ["electronica"],
    filtro: /port[aá]til|macbook|laptop|notebook|chromebook|thinkpad|zenbook|vivobook|ideapad|\blegion\b|\bomen\b/i,
    enVenta: "Portátiles a la venta ahora",
    modelos: [
      { nombre: "MacBook Air y MacBook Pro", articulo: "MacBook", texto: "Con chip de Apple (M1, M2, M3…) o con Intel." },
      { nombre: "Portátiles para jugar", articulo: "Portátil gaming", texto: "ASUS ROG, Lenovo Legion, MSI, HP Omen y similares: los valoramos por su tarjeta gráfica." },
      { nombre: "Portátiles Windows", articulo: "Portátil", texto: "HP, Lenovo, Dell, ASUS, Acer y otras marcas, para estudiar o trabajar." },
    ],
    revisamos: ["La pantalla, el teclado y el touchpad", "La batería: sus ciclos y su autonomía", "El procesador, la memoria y el disco", "Que no tenga bloqueos de BIOS, de iCloud ni de empresa"],
    preparar: ["Haz una copia de tus archivos", "Cierra la sesión de tu cuenta de Apple o de Microsoft (o te ayudamos)", "El cargador original, si lo tienes", "Si falla algo, cuéntanoslo: también compramos portátiles averiados"],
  },
  pc: {
    corto: "PC y periféricos",
    h1: "Compramos tu PC y tus periféricos en Zaragoza",
    lema: "Ordenadores de sobremesa, PC gaming, tarjetas gráficas, monitores, teclados y ratones. Te damos precio en menos de 1 hora y te pagamos al momento.",
    icono: "desktop-outline",
    articulo: "PC",
    boton: "Vender mi PC",
    tuAparato: "tu PC",
    categorias: ["electronica"],
    filtro: /\bpc\b|ordenador|monitor|tarjeta gr[aá]fica|\brtx\b|\bgtx\b|radeon|teclado|rat[oó]n|\btorre\b|procesador/i,
    enVenta: "PC y periféricos a la venta ahora",
    modelos: [
      { nombre: "PC gaming y de sobremesa", articulo: "PC de sobremesa", texto: "Torres completas o por piezas, para jugar, trabajar o diseñar." },
      { nombre: "Tarjetas gráficas", articulo: "Tarjeta gráfica", texto: "NVIDIA GeForce RTX y GTX, y AMD Radeon." },
      { nombre: "Monitores", articulo: "Monitor", texto: "Gaming de alta tasa de refresco, 4K y de oficina." },
      { nombre: "Teclados, ratones y más", articulo: "Periférico", texto: "Teclados mecánicos, ratones, cascos, webcams y micrófonos." },
    ],
    revisamos: ["Que arranque y aguante pruebas de rendimiento y de temperatura", "Los componentes: procesador, gráfica, memoria y discos", "En los monitores, que no haya píxeles muertos ni manchas", "En los periféricos, cada tecla, botón y conexión"],
    preparar: ["Haz una copia de tus archivos y cierra tus cuentas", "La lista de componentes, si la tienes (si no, la sacamos nosotros)", "Los cables de corriente y de vídeo", "La caja original de la gráfica o del monitor, si la tienes"],
  },
  tablets: {
    corto: "iPad y tablets",
    h1: "Compramos tu iPad o tu tablet en Zaragoza",
    lema: "iPad, iPad Air, iPad Pro, iPad mini y tablets Android como la Samsung Galaxy Tab. Te damos precio en menos de 1 hora y te pagamos al momento.",
    icono: "tablet-portrait-outline",
    articulo: "Tablet",
    boton: "Vender mi tablet",
    tuAparato: "tu tablet",
    categorias: ["electronica"],
    filtro: /ipad|tablet|galaxy tab|xiaomi pad|redmi pad/i,
    enVenta: "iPad y tablets a la venta ahora",
    modelos: [
      { nombre: "iPad", articulo: "iPad", texto: "iPad, iPad Air, iPad mini y iPad Pro, con wifi o con datos." },
      { nombre: "Samsung Galaxy Tab", articulo: "Samsung Galaxy Tab", texto: "Las gamas Galaxy Tab S y Galaxy Tab A." },
      { nombre: "Otras tablets Android", articulo: "Tablet Android", texto: "Xiaomi Pad, Lenovo Tab y otras marcas: pregúntanos." },
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

/** Las 5 direcciones se crean al publicar la web. */
export async function generateStaticParams(): Promise<{ tipo: string }[]> {
  return TIPOS.map((tipo) => ({ tipo }));
}

const SELLOS: { icono: IconoNombre; texto: string }[] = [
  { icono: "time-outline", texto: "Precio en menos de 1 hora" },
  { icono: "car-outline", texto: "Recogida en Zaragoza en menos de 2 horas" },
  { icono: "cube-outline", texto: "Envío gratis desde toda España" },
  { icono: "cash-outline", texto: "Pago al momento: Bizum o efectivo" },
];

const PASOS_ZARAGOZA = [
  { titulo: "Cuéntanos qué tienes", texto: "Rellena el formulario con unas fotos. Sin compromiso." },
  { titulo: "Precio en menos de 1 hora", texto: "Te decimos cuánto te damos por el chat de la tienda o por correo." },
  { titulo: "Lo recogemos en menos de 2 horas", texto: "Vamos a por él o nos lo acercas tú, como prefieras." },
  { titulo: "Lo revisamos y te pagamos", texto: "Si está como nos contaste, te pagamos al momento por Bizum o en efectivo." },
];
const PASOS_ESPANA = [
  { titulo: "Cuéntanos qué tienes", texto: "Rellena el formulario con unas fotos. Sin compromiso." },
  { titulo: "Precio en menos de 1 hora", texto: "Te decimos cuánto te damos por el chat de la tienda o por correo." },
  { titulo: "Etiqueta gratis en menos de 2 horas", texto: "Te mandamos la etiqueta de envío: lo embalas y lo envías sin pagar nada." },
  { titulo: "Nos llega en 72 horas como máximo", texto: "Puedes seguir el envío en todo momento." },
  { titulo: "Lo revisamos y te pagamos", texto: "Si está como nos contaste, te pagamos al momento por Bizum. Si no, te proponemos otro precio y, si no te encaja, te lo devolvemos gratis." },
];

function preguntas(p: Pagina): { q: string; a: string }[] {
  return [
    { q: `¿Cuánto me dais por ${p.tuAparato}?`, a: "Depende del modelo, de su estado y de lo que incluya (caja, cargador, accesorios). Cuéntanoslo con unas fotos y te damos un precio en menos de 1 hora, sin compromiso." },
    { q: "¿Lo compráis aunque esté averiado?", a: "Sí. Dinos qué le pasa y te damos precio igualmente: también nos dedicamos a la reparación, así que sabemos valorarlo." },
    { q: "¿Cómo me pagáis?", a: "Al momento, en cuanto lo hemos revisado: por Bizum o en efectivo. Si nos lo envías desde otra ciudad, por Bizum. Firmamos un contrato de compraventa para que todo quede por escrito." },
    { q: "¿Dónde lo recogéis?", a: `En ${ZONAS}, en menos de 2 horas, o nos lo acercas tú. Desde el resto de España te mandamos una etiqueta de envío gratis.` },
    { q: "¿Y si al revisarlo no coincide con lo que conté?", a: "Te explicamos qué hemos visto y te proponemos un nuevo precio. Si no te encaja, te lo devolvemos sin coste." },
    { q: "¿Puedo cambiarlo por algo de la tienda?", a: "Sí: usa su valor para llevarte otro artículo del catálogo. Indícalo en el formulario." },
    { q: "¿Qué necesito para venderlo?", a: "Ser mayor de edad y el propietario del aparato." },
  ];
}

function H2({ children, nativeID }: { children: string; nativeID?: string }) {
  return (
    <Text nativeID={nativeID} accessibilityRole="header" {...({ "aria-level": 2 } as object)} style={{ color: C.text, fontWeight: "900", fontSize: TAMANOS.titulo2 - 2, lineHeight: 30 }}>
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

// Una tarjeta con lista (pasos numerados o marcas de verificación).
function TarjetaLista({ titulo, subtitulo, icono, filas, numerada, ancho, nativeID }: { titulo: string; subtitulo?: string; icono: IconoNombre; filas: { titulo: string; texto?: string }[]; numerada?: boolean; ancho: `${number}%`; nativeID?: string }) {
  return (
    <View nativeID={nativeID} style={{ flexGrow: 1, flexShrink: 1, flexBasis: ancho, minWidth: 0, backgroundColor: C.tile, borderRadius: 20, padding: 20, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentSoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icono} size={21} color={C.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text accessibilityRole="header" {...({ "aria-level": 3 } as object)} style={{ color: C.text, fontWeight: "900", fontSize: TAMANOS.destacado }}>
            {titulo}
          </Text>
          {subtitulo ? <Text style={{ color: C.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18 }}>{subtitulo}</Text> : null}
        </View>
      </View>
      {filas.map((f, i) => (
        <View key={f.titulo} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          {numerada ? (
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.accent, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: TAMANOS.minimo }}>{i + 1}</Text>
            </View>
          ) : (
            <Ionicons name="checkmark-circle" size={22} color={C.accent} style={{ marginTop: 1 }} />
          )}
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ color: C.text, fontWeight: f.texto ? "900" : "700", fontSize: TAMANOS.cuerpo, lineHeight: 21 }}>{f.titulo}</Text>
            {f.texto ? <Text style={{ color: C.muted, fontSize: TAMANOS.cuerpo - 1, lineHeight: 20 }}>{f.texto}</Text> : null}
          </View>
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

  // Lo que hay a la venta de este tipo y, en Consolas, las fotos reales de Categorías.
  useEffect(() => {
    if (!tipo || !p) return;
    let vivo = true;
    void medirEvento("compramos_visto", `Compramos: ${p.corto}`, { path: `/compramos/${tipo}`, metadata: { pagina: tipo } });
    void productosDeCategorias(p.categorias, p.filtro).then((l) => vivo && setEnVenta(l));
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
  const fotos = (tipo === "consolas" ? fotosConsolas : (enVenta ?? []).map((x) => x.image).filter((x): x is string => !!x)).slice(0, 4);
  const padding = isMobile ? 16 : 28;

  const cabeceraTexto = (
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: isMobile ? "100%" : "52%", minWidth: 0, gap: 16, justifyContent: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name={p.icono} size={18} color={C.accentText} />
        <Text style={{ color: C.accentText, fontWeight: "900", fontSize: TAMANOS.minimo, letterSpacing: 1, textTransform: "uppercase" }}>Te lo compramos</Text>
      </View>
      <Text nativeID="compramos-h1" accessibilityRole="header" {...({ "aria-level": 1 } as object)} style={{ color: C.text, fontWeight: "900", fontSize: isMobile ? 30 : 40, lineHeight: isMobile ? 36 : 47 }}>
        {p.h1}
      </Text>
      <Text style={{ color: C.muted, fontSize: isMobile ? 16 : 18, lineHeight: isMobile ? 24 : 27 }}>{p.lema}</Text>
      <View nativeID="compramos-sellos" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {SELLOS.map((s) => (
          <View key={s.texto} style={{ flexGrow: 1, flexBasis: "45%", minWidth: 0, flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 6 : 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: C.tile }}>
            <Ionicons name={s.icono} size={20} color={C.accent} />
            <Text style={{ flexShrink: 1, color: C.text, fontWeight: "800", fontSize: isMobile ? TAMANOS.minimo + 0.5 : TAMANOS.cuerpo - 1, lineHeight: isMobile ? 18 : 19 }}>{s.texto}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
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
            <ImagenInteligente uri={f} ancho={isMobile ? 360 : 480} priority={i === 0 ? "high" : "normal"} alt={`${p.corto} que compramos en Zaragoza`} style={{ width: "100%", height: "100%", borderRadius: fotos.length === 1 ? 0 : 18 }} />
          </View>
        ))}
      </View>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: padding, paddingTop: isMobile ? 12 : 14 }}>
        <View style={{ width: "100%", maxWidth: 1120, alignSelf: "center", gap: isMobile ? 36 : 52 }}>
          <View style={{ gap: isMobile ? 14 : 22 }}>
            <CabeceraMarca />
            {/* Cabecera: el texto y el botón primero; la foto, a la derecha en el ordenador y debajo en el móvil. */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: isMobile ? 20 : 40, alignItems: "center" }}>
              {cabeceraTexto}
              {cabeceraFoto}
            </View>
          </View>

          <View nativeID="compramos-modelos" style={{ gap: 16 }}>
            <H2>{QUE_COMPRAMOS[tipo]}</H2>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {p.modelos.map((m) => (
                <Pressable
                  key={m.nombre}
                  onPress={() => vender(m.articulo, "modelo")}
                  accessibilityRole="button"
                  accessibilityLabel={`Vender ${m.nombre}`}
                  style={({ pressed }) => ({ flexGrow: 1, flexShrink: 1, flexBasis: ancho3, minWidth: 0, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg, padding: 18, gap: 8, opacity: pressed ? 0.85 : 1 })}
                >
                  <Text accessibilityRole="header" {...({ "aria-level": 3 } as object)} style={{ color: C.text, fontWeight: "900", fontSize: TAMANOS.destacado }}>
                    {m.nombre}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: TAMANOS.cuerpo - 1, lineHeight: 20, flexGrow: 1 }}>{m.texto}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={{ color: C.accentText, fontWeight: "900", fontSize: TAMANOS.cuerpo - 1 }}>Pedir precio</Text>
                    <Ionicons name="arrow-forward" size={16} color={C.accentText} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          <View nativeID="compramos-como" style={{ gap: 16 }}>
            <H2>Cómo funciona</H2>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <TarjetaLista nativeID="compramos-zaragoza" titulo="En Zaragoza y alrededores" subtitulo={ZONAS} icono="location-outline" filas={PASOS_ZARAGOZA} numerada ancho={ancho2} />
              <TarjetaLista nativeID="compramos-espana" titulo="Desde el resto de España" subtitulo="Con envío gratis" icono="map-outline" filas={PASOS_ESPANA} numerada ancho={ancho2} />
            </View>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <TarjetaLista titulo="Qué revisamos" icono="shield-checkmark-outline" filas={p.revisamos.map((t) => ({ titulo: t }))} ancho={ancho2} />
            <TarjetaLista titulo="Qué tener preparado" icono="list-outline" filas={p.preparar.map((t) => ({ titulo: t }))} ancho={ancho2} />
          </View>

          {enVenta && enVenta.length ? (
            <CarruselProductosCategoria nativeID="compramos-a-la-venta" titulo={p.enVenta} productos={enVenta} sinMovimiento onTocar={(id) => void medirEvento("compramos_producto", `Compramos: producto (${p.corto})`, { metadata: { pagina: tipo, id } })} />
          ) : null}

          <View nativeID="compramos-preguntas" style={{ gap: 12 }}>
            <H2>Preguntas frecuentes</H2>
            <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 28, rowGap: 0 }}>
              {preguntas(p).map((f) => (
                <View key={f.q} style={{ flexGrow: 1, flexShrink: 1, flexBasis: ancho2, minWidth: 0, gap: 4, paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.line }}>
                  <Text accessibilityRole="header" {...({ "aria-level": 3 } as object)} style={{ color: C.text, fontWeight: "900", fontSize: TAMANOS.cuerpo + 1, lineHeight: 22 }}>
                    {f.q}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: TAMANOS.cuerpo, lineHeight: 22 }}>{f.a}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Llamada final y el resto de páginas «Compramos» (enlaces de verdad, para Google). */}
          <View nativeID="compramos-final" style={{ borderRadius: 28, backgroundColor: C.text, padding: isMobile ? 22 : 36, gap: 16, alignItems: isMobile ? "stretch" : "center" }}>
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: isMobile ? 24 : 30, lineHeight: isMobile ? 30 : 36, textAlign: isMobile ? "left" : "center" }}>¿Te damos precio?</Text>
            <Text style={{ color: "rgba(255,255,255,0.82)", fontSize: TAMANOS.cuerpo + 1, lineHeight: 24, textAlign: isMobile ? "left" : "center", maxWidth: 560 }}>
              Cuéntanos qué tienes y en menos de 1 hora sabrás cuánto te damos. Sin compromiso.
            </Text>
            <Boton nativeID="compramos-vender-final" texto={p.boton} icono="cash-outline" principal onPress={() => vender(p.articulo, "final")} />
          </View>

          <View nativeID="compramos-otras" style={{ gap: 12, alignItems: "center" }}>
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
          </View>

          <PieDePagina sidePadding={padding} contentMaxWidth={640} />
        </View>
        {Platform.OS === "web" ? <View style={{ height: 72 }} /> : null}
      </ScrollView>
    </View>
  );
}
