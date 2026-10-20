/**
 * components/Barramagic.tsx
 *
 * Qué hace: TODO lo relacionado con la barra de búsqueda de la app vive en
 * este único archivo (antes estaba repartido entre este archivo y
 * FloatingSearchBar.tsx, que ya no existe, para no confundirse sobre dónde
 * tocar cada cosa). Exporta dos cosas:
 *
 * - `Barramagic` (export por defecto): la píldora en sí (icono de lupa +
 *   texto/campo + botón ✨ de acceso a Blue IA). Es la pieza visual y se usa
 *   quieta, dentro del scroll normal de una pantalla — así la usa
 *   app/catalogo.tsx.
 * - `FloatingBarramagic` (export con nombre): la misma píldora pero flotando
 *   encima del contenido, arrastrable verticalmente y que se "engancha"
 *   (snap) arriba o abajo, más el ocultado suave al hacer scroll. Así la usa
 *   app/(tabs)/index.tsx (Inicio).
 *
 * Cómo funciona `Barramagic`: tiene dos modos —
 * - mode="input" (por defecto): un TextInput real y controlado
 *   (value/onChangeText/onSubmit), con una "x" para borrar cuando hay texto
 *   escrito. Busca de verdad en la pantalla que la usa (no navega a otro
 *   sitio).
 * - mode="link": no es editable — es un botón que, al tocarlo, llama a
 *   onPress. FloatingBarramagic solo lo usa si se le pasa onPress (el modo
 *   antiguo de Inicio, que llevaba al catálogo: se tocaba la barra y no se
 *   podía escribir en ella).
 * En ambos modos, el botón de la derecha (✨) lleva a /blue-ia salvo que se
 * pase onPressAi con otra acción.
 *
 * Buscador de Inicio (2026-10): FloatingBarramagic es ahora un buscador REAL.
 * Se escribe en la propia barra y, con 2 letras o más, sale un panel con los
 * productos que encajan (título, foto entera y precio) y, un poco más abajo,
 * las SECCIONES de la tienda que encajan con lo escrito («Blog», «Inicio de
 * sesión», «Vender»…: SECCIONES_BUSQUEDA, solo pantallas que existen). Si no
 * hay productos, avisa y deja las secciones y «Preguntar a Blue IA». Intro: si
 * no hay productos pero sí una sección, va directo a ella; si no, abre el
 * catálogo con lo escrito (/catalogo?query=…). El panel va en otra capa para
 * que desplazarlo no arrastre la barra, y sale debajo si la barra está arriba
 * y encima si está abajo.
 *
 * Cómo funciona `FloatingBarramagic`: usa Animated + PanResponder para el
 * arrastre y el efecto muelle (spring) al soltar, y mide la altura real del
 * teclado/viewport en web para no tapar contenido. La prop "hidden" (la
 * controla la pantalla que la use, normalmente según la dirección del
 * scroll) anima un fundido + un pequeño desplazamiento hacia arriba para
 * ocultarla suavemente sin perder su posición de arrastre; al volver a
 * "hidden=false" reaparece igual de suave. Mientras está oculta no
 * intercepta toques.
 *
 * Conectado con:
 * - app/(tabs)/index.tsx → usa FloatingBarramagic sobre la pantalla de
 *   inicio.
 * - app/catalogo.tsx → usa Barramagic (modo "input") dentro del scroll.
 *
 * Septiembre (legibilidad en móvil): en pantallas estrechas, el icono de
 * lupa + los espacios fijos dejaban muy poco ancho real al campo de texto,
 * y el placeholder largo de app/catalogo.tsx se cortaba en silencio (un
 * <input> web no pone "..." si no cabe, simplemente recorta). Se redujeron
 * el icono y los huecos en móvil para dar más aire al campo, y
 * app/catalogo.tsx pasa ahora un placeholder más corto en móvil — entre los
 * dos cambios, el texto se lee siempre entero.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Href } from "expo-router";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { supabase } from "../lib/supabase";
import SmartImage from "./SmartImage";

const COLORS = {
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  bg: "#FFFFFF",
  border: "#E3EAF2",
  brand: "#1EA7E8",
};

function pushRoute(route: Href) {
  router.push(route);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

// Precio siempre con dos decimales, coma decimal y miles con punto (155,00€ · 1.299,00€).
function fmtEUR(n: number) {
  const v = Number(n);
  const cents = Math.round((Number.isFinite(v) ? v : 0) * 100);
  const [ent, dec] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${cents < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

// ---------------------------------------------------------------------------
// Letras con el brillo de colores de Siri (solo web; en nativo, azul de marca). Las usa el buscador cuando la
// guía de Blue escribe en él un ejemplo, y la guía en los nombres de las secciones de la barra de abajo.
// ---------------------------------------------------------------------------

const CSS_SIRI_TEXTO = [
  // Una baldosa de 300 px con los colores de Siri (empieza y acaba en el mismo) que se desplaza justo una baldosa.
  ".vz-siri-texto{display:inline-block;color:#6F8CF7;background-image:linear-gradient(90deg,#1EA7E8,#3FC6F0,#6F8CF7,#A774F2,#EE7DBA,#5B9DF9,#1EA7E8);background-size:300px 100%;background-repeat:repeat-x;animation:vz-siri-texto 2.4s linear infinite;filter:drop-shadow(0 0 5px rgba(167,116,242,.35));}",
  // Solo se vuelve transparente el relleno si el navegador sabe recortar el fondo al texto.
  "@supports (-webkit-background-clip:text) or (background-clip:text){.vz-siri-texto{-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}}",
  "@keyframes vz-siri-texto{from{background-position:0 0}to{background-position:300px 0}}",
  // Barrita que parpadea al final: se ve como si se estuviera escribiendo.
  ".vz-siri-cursor{display:inline-block;width:2px;height:1.05em;margin-left:1px;vertical-align:-0.15em;background:#A774F2;animation:vz-siri-cursor .7s steps(1) infinite;}",
  "@keyframes vz-siri-cursor{50%{opacity:0}}",
  "@media (prefers-reduced-motion: reduce){.vz-siri-texto,.vz-siri-cursor{animation:none}}",
].join("");

const ID_CSS_SIRI_TEXTO = "vz-siri-texto-css";

/** Inyecta la hoja de estilos del brillo una sola vez (solo web). */
export function asegurarCssSiriTexto() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  let el = document.getElementById(ID_CSS_SIRI_TEXTO);
  if (!el) {
    el = document.createElement("style");
    el.id = ID_CSS_SIRI_TEXTO;
    document.head.appendChild(el);
  }
  if (el.textContent !== CSS_SIRI_TEXTO) el.textContent = CSS_SIRI_TEXTO;
}

/** Texto con el brillo de Siri; `cursor` añade la barrita parpadeante del final (como si se estuviera escribiendo). */
export function TextoSiri({ texto, cursor, style }: { texto: string; cursor?: boolean; style?: TextStyle }) {
  useEffect(() => {
    asegurarCssSiriTexto();
  }, []);
  if (Platform.OS !== "web") return <Text style={[{ color: COLORS.brand, fontWeight: "800" }, style]}>{texto}</Text>;
  return (
    <Text style={style}>
      <span className="vz-siri-texto">{texto || "​"}</span>
      {cursor ? <span className="vz-siri-cursor" /> : null}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Demostración para la guía de Blue: la guía escribe un ejemplo en el buscador de Inicio, letra a letra.
// ---------------------------------------------------------------------------

let oyenteDemo: ((texto: string | null) => void) | null = null;
// Cuántos productos enseña la demostración: los que caben encima de la tarjeta de la guía en esta pantalla.
let filasDemo: number | null = null;

/**
 * La guía de Blue escribe en el buscador de Inicio (texto parcial en cada letra); `null` = termina y lo deja vacío.
 * `filas` limita los productos de «lo último añadido / lo más antiguo» a los que caben sin quedar bajo la tarjeta de la guía.
 */
export function escribirEnBuscadorDemo(texto: string | null, filas?: number) {
  filasDemo = texto === null ? null : filas ?? null;
  oyenteDemo?.(texto);
}

// ---------------------------------------------------------------------------
// Búsqueda en vivo de Inicio: productos de la tienda + accesos directos a secciones.
// ---------------------------------------------------------------------------

/** Minúsculas, sin tildes ni signos: «Inicio de sesión» → «inicio de sesion». */
export function normalizarBusqueda(texto: string): string {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type IconoNombre = keyof typeof Ionicons.glyphMap;

export type SeccionBusqueda = {
  titulo: string;
  descripcion: string;
  ruta: string;
  icono: IconoNombre;
  /** Cómo la puede llamar la gente (sin tildes); el título también cuenta. */
  palabras: string[];
};

/**
 * Las secciones a las que se puede saltar desde el buscador. Solo hay lo que existe de verdad en la tienda
 * (lección «Solo se menciona lo que existe»): cada ruta es una pantalla real.
 */
export const SECCIONES_BUSQUEDA: SeccionBusqueda[] = [
  { titulo: "Iniciar sesión", descripcion: "Entra en tu cuenta", ruta: "/perfil?acceso=entrar", icono: "log-in-outline", palabras: ["iniciar sesion", "inicio de sesion", "login", "entrar", "acceder", "acceso", "identificarme", "contrasena", "olvide mi contrasena"] },
  { titulo: "Crear cuenta", descripcion: "Regístrate en un minuto", ruta: "/perfil?acceso=registro", icono: "person-add-outline", palabras: ["crear cuenta", "registro", "registrarme", "registrarse", "darme de alta", "nueva cuenta", "cuenta nueva"] },
  { titulo: "Mi cuenta", descripcion: "Tus datos y tus pedidos", ruta: "/perfil", icono: "person-outline", palabras: ["mi cuenta", "cuenta", "perfil", "mis pedidos", "pedidos", "seguimiento", "seguimientos", "mis datos"] },
  { titulo: "Blog", descripcion: "Lee el blog de la tienda", ruta: "/blog", icono: "newspaper-outline", palabras: ["blog", "articulos", "entradas"] },
  { titulo: "Catálogo", descripcion: "Todos los productos", ruta: "/catalogo", icono: "grid-outline", palabras: ["catalogo", "productos", "tienda", "consolas", "videojuegos", "juegos", "accesorios", "comprar"] },
  { titulo: "Vender", descripcion: "Envía tu artículo para venderlo", ruta: "/vender", icono: "cash-outline", palabras: ["vender", "venta", "vende", "vender mi articulo"] },
  { titulo: "Servicios", descripcion: "Reparaciones y servicios", ruta: "/servicios", icono: "construct-outline", palabras: ["servicios", "reparacion", "reparaciones", "arreglo", "arreglar", "mantenimiento", "limpieza"] },
  { titulo: "Cesta", descripcion: "Tus artículos reservados", ruta: "/cesta", icono: "bag-outline", palabras: ["cesta", "carrito", "carro", "mi cesta", "pagar", "checkout"] },
  { titulo: "Foro", descripcion: "Habla con la comunidad", ruta: "/chat-global", icono: "chatbubbles-outline", palabras: ["foro", "chat", "comunidad", "mensajes"] },
  { titulo: "Blue IA", descripcion: "Pregunta lo que quieras", ruta: "/blue-ia", icono: "sparkles-outline", palabras: ["blue", "blue ia", "ia", "asistente", "preguntar", "pregunta", "ayuda", "inteligencia artificial"] },
  { titulo: "Política de envíos", descripcion: "Plazos y condiciones de envío", ruta: "/politicas/envios", icono: "cube-outline", palabras: ["envios", "envio", "entrega", "entregas", "gastos de envio", "politica de envios"] },
  { titulo: "Política de devoluciones", descripcion: "Cómo devolver un pedido", ruta: "/politicas/devoluciones", icono: "return-down-back-outline", palabras: ["devoluciones", "devolucion", "devolver", "reembolso", "politica de devoluciones"] },
  { titulo: "Política de privacidad", descripcion: "Cómo tratamos tus datos", ruta: "/politicas/privacidad", icono: "shield-checkmark-outline", palabras: ["privacidad", "datos personales", "proteccion de datos", "rgpd", "politica de privacidad"] },
  { titulo: "Términos y condiciones", descripcion: "Condiciones de compra y uso", ruta: "/politicas/terminos", icono: "document-text-outline", palabras: ["terminos", "terminos y condiciones", "condiciones", "legal"] },
  { titulo: "Inicio", descripcion: "Volver a la portada", ruta: "/", icono: "home-outline", palabras: ["inicio", "home", "portada", "principal"] },
];

const SECCIONES_NORMALIZADAS = SECCIONES_BUSQUEDA.map((s) => ({
  seccion: s,
  palabras: Array.from(new Set([...s.palabras, s.titulo].map(normalizarBusqueda))),
}));

/**
 * Qué secciones encajan con lo escrito (como mucho 3, las mejores primero): 100 si es exactamente una de sus
 * palabras, 85 si lo escrito es el principio de una, 70 si cada palabra escrita es el principio de alguna
 * palabra suya («sesion» → «iniciar sesion»). Solo se enseñan las que están cerca de la mejor.
 */
export function seccionesParaBusqueda(texto: string): SeccionBusqueda[] {
  const q = normalizarBusqueda(texto);
  if (q.length < 2) return [];
  const tokens = q.split(" ").filter((t) => t.length >= 2);
  const puntuadas: { seccion: SeccionBusqueda; puntos: number }[] = [];
  for (const { seccion, palabras } of SECCIONES_NORMALIZADAS) {
    let puntos = 0;
    for (const p of palabras) {
      if (p === q) {
        puntos = 100;
        break;
      }
      if (q.length >= 3 && p.startsWith(q)) puntos = Math.max(puntos, 85);
      else if (q.length >= 3 && tokens.length && tokens.every((t) => p.split(" ").some((w) => w.startsWith(t)))) puntos = Math.max(puntos, 70);
    }
    if (puntos >= 60) puntuadas.push({ seccion, puntos });
  }
  puntuadas.sort((a, b) => b.puntos - a.puntos);
  const mejor = puntuadas[0]?.puntos ?? 0;
  return puntuadas.filter((x) => x.puntos >= mejor - 30).slice(0, 3).map((x) => x.seccion);
}

export type ProductoBusqueda = { id: string; titulo: string; precio: number; imagen: string | null };

const MAX_PRODUCTOS_PANEL = 4;
const MAX_PRODUCTOS_INTENCION = 3;

export type IntencionBusqueda = "recientes" | "antiguos";

const PALABRAS_RECIENTES = ["ultimo", "ultima", "ultimos", "ultimas", "reciente", "recientes", "novedad", "novedades"];
const PALABRAS_ANTIGUAS = ["antiguo", "antigua", "antiguos", "antiguas", "viejo", "vieja", "viejos", "viejas", "primero", "primeros"];
const PALABRAS_DE_RELLENO = ["lo", "los", "las", "el", "la", "que", "se", "ha", "han", "he", "mas", "anadido", "anadidos", "anadida", "anadidas", "agregado", "agregados", "subido", "subidos", "publicado", "publicados", "producto", "productos", "articulo", "articulos"];

/**
 * «Lo último añadido» o «lo más antiguo»: no se busca ese texto en los productos, se enseñan los más recientes o
 * los más antiguos. Solo si TODAS las palabras son de ese tipo (o de relleno como «lo», «más», «añadido») y no
 * se mezclan las dos ideas; «último modelo de ps5», por ejemplo, sigue siendo una búsqueda normal.
 */
export function intencionDeBusqueda(texto: string): IntencionBusqueda | null {
  const palabras = normalizarBusqueda(texto).split(" ").filter(Boolean);
  if (!palabras.length) return null;
  const reciente = palabras.some((w) => PALABRAS_RECIENTES.includes(w));
  const antigua = palabras.some((w) => PALABRAS_ANTIGUAS.includes(w));
  if (reciente === antigua) return null;
  const permitidas = [...PALABRAS_RECIENTES, ...PALABRAS_ANTIGUAS, ...PALABRAS_DE_RELLENO];
  if (!palabras.every((w) => permitidas.includes(w))) return null;
  return reciente ? "recientes" : "antiguos";
}

// Misma regla que el catálogo (app/catalogo.tsx): la portada es la marcada, o la primera por orden, o images[0].
async function buscarProductosInicio(texto: string, intencion: IntencionBusqueda | null): Promise<{ productos: ProductoBusqueda[]; total: number } | null> {
  try {
    const seguro = texto.replace(/[%(),*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!seguro) return { productos: [], total: 0 };
    const patron = `%${seguro}%`;
    let consulta = supabase
      .from("products")
      .select("id,title,price_eur,images", { count: "exact" })
      .eq("is_active", true)
      .eq("status", "PUBLISHED");
    if (!intencion) consulta = consulta.or(`title.ilike.${patron},description.ilike.${patron}`);
    const { data, error, count } = await consulta
      .order("created_at", { ascending: intencion === "antiguos" })
      .range(0, Math.min(intencion ? MAX_PRODUCTOS_INTENCION : MAX_PRODUCTOS_PANEL, filasDemo ?? 99) - 1);
    if (error) return null;
    const filas = (Array.isArray(data) ? data : []) as { id: string; title: string | null; price_eur: number | string | null; images?: string[] | null }[];
    const portadas = new Map<string, string>();
    if (filas.length) {
      const { data: medios, error: errorMedios } = await supabase
        .from("product_media")
        .select("product_id,public_url,sort_order,is_cover")
        .eq("kind", "image")
        .in("product_id", filas.map((f) => f.id));
      if (!errorMedios && Array.isArray(medios)) {
        const ordenados = [...(medios as { product_id: string; public_url?: string | null; sort_order?: number | null; is_cover?: boolean | null }[])].sort(
          (a, b) => Number(!!b.is_cover) - Number(!!a.is_cover) || (a.sort_order ?? 9999) - (b.sort_order ?? 9999)
        );
        for (const m of ordenados) {
          const url = typeof m.public_url === "string" ? m.public_url.trim() : "";
          if (url && !portadas.has(m.product_id)) portadas.set(m.product_id, url);
        }
      }
    }
    const productos = filas.map((f) => ({
      id: f.id,
      titulo: String(f.title ?? "").trim() || "Producto",
      precio: Number(f.price_eur ?? 0),
      imagen: portadas.get(f.id) ?? (Array.isArray(f.images) && typeof f.images[0] === "string" ? f.images[0] : null),
    }));
    return { productos, total: typeof count === "number" ? count : productos.length };
  } catch {
    return null;
  }
}

type EstadoBusqueda = { texto: string; cargando: boolean; productos: ProductoBusqueda[]; total: number; error: boolean };

/** Lo que enseña el panel del buscador para lo escrito: productos (con una espera de 0,26 s al teclear) y secciones. */
export function useBusquedaInicio(textoCrudo: string) {
  const texto = textoCrudo.trim();
  // «Lo último añadido» / «lo más antiguo»: se enseñan los más recientes o los más antiguos, sin secciones.
  const intencion = useMemo(() => intencionDeBusqueda(texto), [texto]);
  const secciones = useMemo(() => (intencion ? [] : seccionesParaBusqueda(texto)), [texto, intencion]);
  const [estado, setEstado] = useState<EstadoBusqueda>({ texto: "", cargando: false, productos: [], total: 0, error: false });

  useEffect(() => {
    if (texto.length < 2) {
      setEstado({ texto, cargando: false, productos: [], total: 0, error: false });
      return;
    }
    let vigente = true;
    setEstado((e) => ({ ...e, cargando: true }));
    const espera = setTimeout(async () => {
      const r = await buscarProductosInicio(texto, intencion);
      if (!vigente) return;
      setEstado({ texto, cargando: false, productos: r?.productos ?? [], total: r?.total ?? 0, error: r === null });
    }, 260);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [texto, intencion]);

  // «listo»: los productos que hay en el estado son de lo que está escrito ahora (no de una letra antes).
  return { texto, intencion, secciones, productos: estado.productos, total: estado.total, error: estado.error, listo: !estado.cargando && estado.texto === texto };
}

type BusquedaInicio = ReturnType<typeof useBusquedaInicio>;

function FilaPanel({ onPress, etiqueta, children, primera }: { onPress: () => void; etiqueta: string; children: React.ReactNode; primera?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={etiqueta}
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderTopWidth: primera ? 0 : 1,
        borderTopColor: COLORS.border,
        backgroundColor: pressed ? "rgba(30,167,232,0.08)" : "transparent",
      })}
    >
      {children}
    </Pressable>
  );
}

function TextoPanel({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, justifyContent: "center" }}>
      <Text style={{ color: COLORS.muted, fontSize: 14, lineHeight: 19, textAlign: "center", fontWeight: "600" }}>{children}</Text>
    </View>
  );
}

/**
 * Panel con los resultados bajo (o sobre) el buscador de Inicio. Primero los productos; si no hay ninguno, el
 * aviso «No hay productos para…». Un poco más abajo, las secciones que encajan con lo escrito (p. ej. «Blog» o
 * «Inicio de sesión»). Sin productos, además, se ofrece preguntar a Blue IA.
 */
function PanelBusqueda({
  busqueda,
  maxAlto,
  onIrA,
  onVerTodo,
  onPreguntar,
}: {
  busqueda: BusquedaInicio;
  maxAlto: number;
  onIrA: (ruta: string) => void;
  onVerTodo: () => void;
  onPreguntar: () => void;
}) {
  const { texto, productos, total, secciones, listo, error, intencion } = busqueda;
  const hayProductos = listo && productos.length > 0;
  const titulosIntencion: Record<IntencionBusqueda, string> = { recientes: "Lo último añadido", antiguos: "Lo más antiguo" };
  return (
    <View
      nativeID="buscador-resultados"
      style={{
        width: "100%",
        borderRadius: 22,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.bg,
        overflow: "hidden",
        ...Platform.select({
          ios: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
          android: { elevation: 6 },
          default: { boxShadow: "0 8px 24px rgba(11,33,56,0.14)" } as ViewStyle,
        }),
      }}
    >
      <ScrollView style={{ maxHeight: maxAlto }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {intencion ? (
          <View style={{ minHeight: 40, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center" }}>
            <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 18, textAlign: "center", fontWeight: "800" }}>{titulosIntencion[intencion]}</Text>
          </View>
        ) : null}
        {!listo ? (
          <TextoPanel>Buscando…</TextoPanel>
        ) : hayProductos ? (
          <>
            {productos.map((p, i) => (
              <FilaPanel key={p.id} primera={i === 0 && !intencion} onPress={() => onIrA(`/producto/${p.id}`)} etiqueta={`${p.titulo}, ${fmtEUR(p.precio)}`}>
                <View style={{ width: 48, height: 48, flexShrink: 0, backgroundColor: "#FFFFFF" }}>
                  {p.imagen ? <SmartImage uri={p.imagen} alt={p.titulo} ancho={96} contentFit="contain" style={{ width: "100%", height: "100%" }} /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={2} style={{ color: COLORS.text, fontSize: 14.5, lineHeight: 19, fontWeight: "700", textAlign: "center" }}>
                    {p.titulo}
                  </Text>
                  <Text style={{ color: COLORS.brand, fontSize: 14, lineHeight: 19, fontWeight: "800", textAlign: "center" }}>{fmtEUR(p.precio)}</Text>
                </View>
                <View style={{ width: 48, flexShrink: 0 }} />
              </FilaPanel>
            ))}
            {intencion ? (
              <FilaPanel onPress={onVerTodo} etiqueta="Ver todo el catálogo">
                <Text style={{ flex: 1, color: COLORS.brand, fontSize: 14.5, fontWeight: "800", textAlign: "center" }}>Ver todo el catálogo</Text>
              </FilaPanel>
            ) : total > productos.length ? (
              <FilaPanel onPress={onVerTodo} etiqueta={`Ver los ${total} resultados en el catálogo`}>
                <Text style={{ flex: 1, color: COLORS.brand, fontSize: 14.5, fontWeight: "800", textAlign: "center" }}>Ver los {total} resultados en el catálogo</Text>
              </FilaPanel>
            ) : null}
          </>
        ) : (
          <TextoPanel>{error ? "No se ha podido buscar ahora mismo." : intencion ? "Todavía no hay productos." : `No hay productos para «${texto}»`}</TextoPanel>
        )}

        {secciones.map((s) => (
          <FilaPanel key={s.ruta} onPress={() => onIrA(s.ruta)} etiqueta={`${s.titulo}: ${s.descripcion}`} primera={false}>
            <Ionicons name={s.icono} size={22} color={COLORS.text} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: COLORS.text, fontSize: 15, lineHeight: 20, fontWeight: "800", textAlign: "center" }}>
                {s.titulo}
              </Text>
              <Text numberOfLines={1} style={{ color: COLORS.muted, fontSize: 13, lineHeight: 17, textAlign: "center" }}>
                {s.descripcion}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={COLORS.muted} />
          </FilaPanel>
        ))}

        {listo && !hayProductos && !intencion ? (
          <FilaPanel onPress={onPreguntar} etiqueta={`Preguntar a Blue IA: ${texto}`}>
            <Ionicons name="sparkles-outline" size={22} color={COLORS.text} />
            <Text numberOfLines={2} style={{ flex: 1, color: COLORS.text, fontSize: 14.5, lineHeight: 19, fontWeight: "700", textAlign: "center" }}>
              Preguntar a Blue IA: «{texto}»
            </Text>
            <Ionicons name="arrow-forward" size={18} color={COLORS.muted} />
          </FilaPanel>
        ) : null}
      </ScrollView>
    </View>
  );
}

export type BarramagicProps = {
  isMobile: boolean;

  /** "input" = buscador real y editable. "link" = botón que navega. */
  mode?: "input" | "link";

  /** mode="input": valor controlado del campo. */
  value?: string;
  /** mode="input": se llama al escribir. */
  onChangeText?: (text: string) => void;
  /** mode="input": se llama al pulsar intro/buscar en el teclado. */
  onSubmit?: () => void;
  /** mode="input": se llama al tocar la "x" para borrar (por defecto, deja el campo vacío). */
  onClear?: () => void;
  /** mode="input": el campo gana o pierde el foco, y se pulsa una tecla (Inicio lo usa para abrir y cerrar sus resultados). */
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyPress?: (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => void;
  /** mode="input": si no es null, el texto se dibuja con el brillo de Siri y el campo no se puede escribir (demostración de la guía). */
  textoSiri?: string | null;

  /** mode="link": se llama al tocar toda la píldora. */
  onPress?: () => void;

  /** Botón ✨: por defecto lleva a /blue-ia. */
  onPressAi?: () => void;

  placeholder?: string;
  style?: ViewStyle;
};

export default function Barramagic({
  isMobile,
  mode = "input",
  value,
  onChangeText,
  onSubmit,
  onClear,
  onFocus,
  onBlur,
  onKeyPress,
  textoSiri,
  onPress,
  onPressAi,
  placeholder = "Buscar producto o hacer una pregunta",
  style,
}: BarramagicProps) {
  const handleAiPress = (event?: GestureResponderEvent) => {
    event?.stopPropagation?.();
    if (onPressAi) {
      onPressAi();
      return;
    }
    pushRoute("/blue-ia" as Href);
  };

  const pillStyle: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: isMobile ? 8 : 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    minHeight: isMobile ? 58 : 64,
    paddingLeft: isMobile ? 14 : 18,
    paddingRight: isMobile ? 6 : 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 2 },
      default: {},
    }),
    ...style,
  };

  const aiButton = (
    <Pressable
      onPress={handleAiPress}
      hitSlop={8}
      style={({ pressed }) => ({
        opacity: pressed ? 0.82 : 1,
        width: isMobile ? 40 : 48,
        height: isMobile ? 40 : 48,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.bg,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      })}
    >
      <Ionicons name="sparkles-outline" size={isMobile ? 20 : 22} color={COLORS.text} />
    </Pressable>
  );

  if (mode === "link") {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.96 : 1 })}>
        <View style={pillStyle}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: isMobile ? 8 : 14, flex: 1, minWidth: 0 }}>
            <Ionicons name="search-outline" size={isMobile ? 20 : 27} color={COLORS.text} />
            <Text
              numberOfLines={1}
              // adjustsFontSizeToFit + minimumFontScale: en vez de recortar
              // con "..." cuando el texto no cabe (pantallas móviles
              // estrechas), encoge la letra lo justo para que quepa entera
              // en una sola línea.
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={{
                color: COLORS.muted,
                fontSize: isMobile ? 13.5 : 16,
                lineHeight: isMobile ? 18 : 22,
                flex: 1,
              }}
            >
              {placeholder}
            </Text>
          </View>
          {aiButton}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={pillStyle}>
      {/* gap más ajustado en móvil (antes 14 fijo): en pantallas estrechas
          dejaba muy poco ancho real al campo de texto y el placeholder
          largo ("Buscar consola, videojuego, accesorio...") se cortaba sin
          avisar (un <input> web recorta en silencio si no cabe, no pone
          "..."). Con más ancho disponible para el campo, más el placeholder
          más corto en móvil que se pasa desde cada pantalla, ya se lee
          entero. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: isMobile ? 10 : 14, flex: 1, minWidth: 0 }}>
        <Ionicons name="search-outline" size={isMobile ? 21 : 27} color={COLORS.text} />

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(11,33,56,0.45)"
          editable={textoSiri == null}
          style={{
            flex: 1,
            // En la demostración de la guía, las letras las dibuja TextoSiri encima (con el brillo de Siri).
            color: textoSiri != null ? "transparent" : COLORS.text,
            fontWeight: "600",
            paddingVertical: 0,
            // 16px fijo (antes 15 en móvil): por debajo de 16, el móvil
            // hace zoom automático al tocar la casilla, y como esto es el
            // buscador de toda la app, ese zoom se notaba en casi
            // cualquier pantalla.
            fontSize: 16,
            // Sin el recuadro negro que el navegador pinta al escribir: la propia píldora ya se ve como el campo.
            ...(Platform.OS === "web" ? ({ outlineStyle: "none", outlineWidth: 0 } as object) : {}),
          }}
          returnKeyType="search"
          onSubmitEditing={onSubmit}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyPress={onKeyPress}
          accessibilityLabel={placeholder}
        />

        {textoSiri != null ? (
          <View
            pointerEvents="none"
            style={{ position: "absolute", left: isMobile ? 31 : 41, right: 28, top: 0, bottom: 0, justifyContent: "center" }}
          >
            <TextoSiri texto={textoSiri} cursor style={{ fontSize: 16, fontWeight: "600" }} />
          </View>
        ) : null}

        {value ? (
          <Pressable
            onPress={() => (onClear ? onClear() : onChangeText?.(""))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Borrar búsqueda"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Ionicons name="close-circle" size={19} color={COLORS.muted} />
          </Pressable>
        ) : null}
      </View>

      {aiButton}
    </View>
  );
}

// ---------------------------------------------------------------------------
// FloatingBarramagic — la misma píldora, pero flotante/arrastrable (Inicio).
// ---------------------------------------------------------------------------

type SearchSnapPosition = "top" | "bottom";

export type FloatingBarramagicProps = {
  isMobile: boolean;

  /**
   * POSICIÓN FINAL DE ARRIBA.
   * Menor número = más arriba
   * Mayor número = más abajo
   */
  topSnapY?: number;

  /**
   * ALTURA VISUAL DE LA TAB BAR INFERIOR DE TU APP EN MÓVIL.
   */
  mobileTabBarHeight?: number;

  /**
   * ALTURA VISUAL DE LA TAB BAR INFERIOR EN DESKTOP/TABLET.
   */
  desktopTabBarHeight?: number;

  /**
   * SEPARACIÓN ENTRE LA SEARCH BAR Y LA TAB BAR INFERIOR.
   */
  bottomGapMobile?: number;
  bottomGapDesktop?: number;

  /**
   * ANCHO DE LA SEARCH BAR EN MÓVIL.
   */
  widthMobilePercent?: number;

  /**
   * ANCHO DE LA SEARCH BAR EN DESKTOP.
   */
  widthDesktopPercent?: number;

  /**
   * LÍMITE MÁXIMO DE ANCHO.
   */
  maxWidth?: number;

  onSnapChange?: (position: SearchSnapPosition) => void;

  /**
   * true = ocultar con una animación suave (al hacer scroll hacia abajo en
   * la pantalla de inicio). No afecta a su posición de arrastre (top/bottom
   * snap), solo a si se ve o no en este momento.
   */
  hidden?: boolean;

  /**
   * Si se pasa, la píldora es un botón que ejecuta esto al tocarla (el modo antiguo). Si no, es un buscador
   * REAL: se escribe en ella y debajo (o encima, si está abajo) salen los productos y las secciones que encajan.
   */
  onPress?: () => void;
  placeholder?: string;
  /** Dónde arranca: "top" (por defecto) o "bottom" (a mano del pulgar en el móvil). */
  posicionInicial?: SearchSnapPosition;
};

export function FloatingBarramagic({
  isMobile,
  topSnapY,
  mobileTabBarHeight = 92,
  desktopTabBarHeight = 96,
  bottomGapMobile = 12,
  bottomGapDesktop = 14,
  widthMobilePercent = 0.86,
  widthDesktopPercent = 0.74,
  maxWidth = 760,
  onSnapChange,
  hidden = false,
  onPress,
  placeholder: placeholderProp,
  posicionInicial = "top",
}: FloatingBarramagicProps) {
  const { width, height } = useWindowDimensions();
  const widthSafe = width > 0 ? width : 1024;
  // En móvil el campo es estrecho y un <input> recorta el texto largo sin avisar: placeholder corto.
  const placeholder = placeholderProp ?? (isMobile ? "Buscar en la tienda" : "Buscar productos, secciones o hacer una pregunta");

  // Buscador real (si no se pasa onPress): texto, si los resultados están abiertos y qué hay que enseñar.
  const modoEnlace = !!onPress;
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const cierreRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busqueda = useBusquedaInicio(modoEnlace ? "" : texto);
  // Demostración de la guía de Blue (escribirEnBuscadorDemo): el texto lo pone la guía, con el brillo de Siri.
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    if (modoEnlace) return;
    oyenteDemo = (t) => {
      if (t === null) {
        setDemo(false);
        setTexto("");
        setAbierto(false);
        return;
      }
      setDemo(true);
      setTexto(t);
      setAbierto(t.trim().length >= 2);
    };
    return () => {
      oyenteDemo = null;
    };
  }, [modoEnlace]);
  useEffect(
    () => () => {
      if (cierreRef.current) clearTimeout(cierreRef.current);
    },
    []
  );

  /**
   * ALTURA VISIBLE REAL
   * En web móvil usamos visualViewport cuando exista para evitar bailes raros.
   */
  const [viewportHeight, setViewportHeight] = useState<number>(height > 0 ? height : 900);

  useEffect(() => {
    const fallback = height > 0 ? height : 900;

    if (Platform.OS !== "web" || typeof window === "undefined") {
      setViewportHeight(fallback);
      return;
    }

    const readViewportHeight = () => {
      const vv = window.visualViewport;
      const nextHeight =
        typeof vv?.height === "number" && vv.height > 0
          ? vv.height
          : window.innerHeight > 0
          ? window.innerHeight
          : fallback;

      setViewportHeight(nextHeight);
    };

    readViewportHeight();

    const vv = window.visualViewport;
    window.addEventListener("resize", readViewportHeight);
    vv?.addEventListener?.("resize", readViewportHeight);
    vv?.addEventListener?.("scroll", readViewportHeight);

    return () => {
      window.removeEventListener("resize", readViewportHeight);
      vv?.removeEventListener?.("resize", readViewportHeight);
      vv?.removeEventListener?.("scroll", readViewportHeight);
    };
  }, [height]);

  /**
   * ALTURA REAL MEDIDA DE LA SEARCH BAR.
   */
  const estimatedSearchBarHeight = isMobile ? 58 : 64;
  const [measuredSearchBarHeight, setMeasuredSearchBarHeight] =
    useState<number>(estimatedSearchBarHeight);

  const handleSearchLayout = (e: LayoutChangeEvent) => {
    const nextHeight = Math.round(e.nativeEvent.layout.height || estimatedSearchBarHeight);
    if (nextHeight > 0 && nextHeight !== measuredSearchBarHeight) {
      setMeasuredSearchBarHeight(nextHeight);
    }
  };

  /**
   * POSICIÓN DE ARRIBA.
   * POR DEFECTO SIEMPRE ARRANCA ARRIBA.
   */
  const resolvedTopSnapY = topSnapY ?? (isMobile ? 84 : 92);

  /**
   * POSICIÓN DE ABAJO.
   */
  const resolvedBottomSnapY = Math.max(
    resolvedTopSnapY + 80,
    viewportHeight -
      (isMobile ? mobileTabBarHeight : desktopTabBarHeight) -
      (isMobile ? bottomGapMobile : bottomGapDesktop) -
      measuredSearchBarHeight
  );

  const searchBarWidth = useMemo(() => {
    return isMobile
      ? widthSafe * widthMobilePercent
      : Math.min(widthSafe * widthDesktopPercent, maxWidth);
  }, [isMobile, maxWidth, widthDesktopPercent, widthMobilePercent, widthSafe]);

  /**
   * ESTADO INICIAL SIEMPRE EN TOP.
   */
  const [searchSnapPosition, setSearchSnapPosition] =
    useState<SearchSnapPosition>(posicionInicial);

  /**
   * Arranca desde el primer render en su posición inicial (arriba, o abajo en el móvil para
   * que el pulgar llegue sin estirarse).
   */
  const topInicial = posicionInicial === "bottom" ? resolvedBottomSnapY : resolvedTopSnapY;
  const animatedTop = useRef(new Animated.Value(topInicial)).current;
  const dragStartTop = useRef(topInicial);
  const liveTop = useRef(topInicial);
  const didInitRef = useRef(false);

  useEffect(() => {
    const id = animatedTop.addListener(({ value }) => {
      liveTop.current = value;
    });

    return () => {
      animatedTop.removeListener(id);
    };
  }, [animatedTop]);

  /**
   * Cuando cambian medidas/viewport:
   * - al primer montaje queda arriba sí o sí
   * - después respeta si el usuario la movió arriba o abajo
   */
  useEffect(() => {
    const nextTarget =
      searchSnapPosition === "top" ? resolvedTopSnapY : resolvedBottomSnapY;

    if (!didInitRef.current) {
      didInitRef.current = true;
      liveTop.current = nextTarget;
      dragStartTop.current = nextTarget;
      animatedTop.setValue(nextTarget);
      return;
    }

    liveTop.current = nextTarget;
    dragStartTop.current = nextTarget;

    Animated.spring(animatedTop, {
      toValue: nextTarget,
      useNativeDriver: false,
      damping: 20,
      stiffness: 180,
      mass: 0.9,
      overshootClamping: false,
      restDisplacementThreshold: 0.5,
      restSpeedThreshold: 0.5,
    }).start();
  }, [
    animatedTop,
    resolvedBottomSnapY,
    resolvedTopSnapY,
    searchSnapPosition,
  ]);

  useEffect(() => {
    onSnapChange?.(searchSnapPosition);
  }, [onSnapChange, searchSnapPosition]);

  const snapSearchBar = (target: SearchSnapPosition) => {
    const toValue = target === "top" ? resolvedTopSnapY : resolvedBottomSnapY;

    setSearchSnapPosition(target);
    liveTop.current = toValue;
    dragStartTop.current = toValue;

    Animated.spring(animatedTop, {
      toValue,
      useNativeDriver: false,
      damping: 20,
      stiffness: 180,
      mass: 0.9,
      overshootClamping: false,
      restDisplacementThreshold: 0.5,
      restSpeedThreshold: 0.5,
    }).start();
  };

  /**
   * Ocultado por scroll: fundido + pequeño desplazamiento hacia arriba,
   * independiente de "animatedTop" (que sigue guardando la posición de
   * arrastre top/bottom para cuando vuelva a mostrarse).
   */
  const hideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(hideAnim, {
      toValue: hidden ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [hidden, hideAnim]);

  const hideOpacity = hideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const hideTranslateY = hideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -24] });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return (
            Math.abs(gestureState.dy) > 6 &&
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
          );
        },
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
          return (
            Math.abs(gestureState.dy) > 6 &&
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
          );
        },
        onPanResponderGrant: () => {
          dragStartTop.current = liveTop.current;
        },
        onPanResponderMove: (_, gestureState) => {
          const nextTop = clampNumber(
            dragStartTop.current + gestureState.dy,
            resolvedTopSnapY,
            resolvedBottomSnapY
          );

          liveTop.current = nextTop;
          animatedTop.setValue(nextTop);
        },
        onPanResponderRelease: (_, gestureState) => {
          const currentTop = clampNumber(
            dragStartTop.current + gestureState.dy,
            resolvedTopSnapY,
            resolvedBottomSnapY
          );
          const middle = (resolvedTopSnapY + resolvedBottomSnapY) / 2;
          snapSearchBar(currentTop <= middle ? "top" : "bottom");
        },
        onPanResponderTerminate: (_, gestureState) => {
          const currentTop = clampNumber(
            dragStartTop.current + gestureState.dy,
            resolvedTopSnapY,
            resolvedBottomSnapY
          );
          const middle = (resolvedTopSnapY + resolvedBottomSnapY) / 2;
          snapSearchBar(currentTop <= middle ? "top" : "bottom");
        },
        onPanResponderTerminationRequest: () => true,
        onShouldBlockNativeResponder: () => false,
      }),
    [animatedTop, resolvedBottomSnapY, resolvedTopSnapY]
  );

  // --- buscador real -------------------------------------------------------------------------------
  const alEnfocar = () => {
    if (cierreRef.current) clearTimeout(cierreRef.current);
    setAbierto(true);
  };
  // Con un pequeño retraso: al tocar una fila del panel el campo pierde el foco ANTES de que llegue el toque.
  const alDesenfocar = () => {
    if (demo) return; // la demostración de la guía mantiene el panel abierto
    if (cierreRef.current) clearTimeout(cierreRef.current);
    cierreRef.current = setTimeout(() => setAbierto(false), 220);
  };
  const irA = (ruta: string) => {
    if (cierreRef.current) clearTimeout(cierreRef.current);
    setAbierto(false);
    setTexto("");
    pushRoute(ruta as Href);
  };
  const alEnviar = () => {
    const t = texto.trim();
    if (!t) return;
    // «Lo último añadido» / «lo más antiguo»: no es un texto que buscar, se abre el catálogo entero.
    if (busqueda.intencion) {
      irA("/catalogo");
      return;
    }
    // Sin productos pero con una sección que encaja («Blog», «Inicio de sesión»): directo a ella.
    if (busqueda.listo && busqueda.productos.length === 0 && busqueda.secciones.length > 0) {
      irA(busqueda.secciones[0].ruta);
      return;
    }
    irA(`/catalogo?query=${encodeURIComponent(t)}`);
  };
  const alPulsarTecla = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === "Escape") setAbierto(false);
  };
  const panelVisible = !modoEnlace && abierto && texto.trim().length >= 2;
  // Alto que cabe para el panel: lo que queda debajo del buscador (si está arriba) o encima (si está abajo).
  const alturaDisponible =
    searchSnapPosition === "top"
      ? viewportHeight - resolvedTopSnapY - measuredSearchBarHeight - 24
      : resolvedBottomSnapY - 24;
  const maxAltoPanel = clampNumber(alturaDisponible, 150, 440);

  return (
    <>
      <Animated.View
        // id en la web: la guía de Blue (components/Campanita.tsx) señala el buscador.
        nativeID="buscador-flotante"
        pointerEvents={hidden ? "none" : "box-none"}
        {...panResponder.panHandlers}
        style={{
          position: "absolute",
          top: animatedTop,
          left: 0,
          right: 0,
          alignItems: "center",
          zIndex: 999,
          elevation: 999,
          opacity: hideOpacity,
          transform: [{ translateY: hideTranslateY }],
        }}
      >
        <View
          onLayout={handleSearchLayout}
          style={{
            width: searchBarWidth,
            maxWidth,
          }}
        >
          {modoEnlace ? (
            <Barramagic isMobile={isMobile} mode="link" onPress={onPress} placeholder={placeholder} />
          ) : (
            <Barramagic
              isMobile={isMobile}
              mode="input"
              value={texto}
              onChangeText={(t) => {
                setTexto(t);
                alEnfocar();
              }}
              onSubmit={alEnviar}
              onClear={() => setTexto("")}
              onFocus={alEnfocar}
              onBlur={alDesenfocar}
              onKeyPress={alPulsarTecla}
              textoSiri={demo ? texto : null}
              placeholder={placeholder}
            />
          )}
        </View>
      </Animated.View>

      {/*
        Resultados: en OTRA capa (no dentro de la que arrastra el buscador) para que desplazarse por la lista
        no arrastre el buscador. Siguen su posición: debajo si está arriba, encima si está abajo.
      */}
      {panelVisible ? (
        <Animated.View
          pointerEvents={hidden ? "none" : "box-none"}
          style={{
            position: "absolute",
            top: animatedTop,
            left: 0,
            right: 0,
            alignItems: "center",
            zIndex: 998,
            elevation: 998,
            opacity: hideOpacity,
            transform: [{ translateY: hideTranslateY }],
          }}
        >
          <View pointerEvents="box-none" style={{ width: searchBarWidth, maxWidth, height: measuredSearchBarHeight }}>
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                ...(searchSnapPosition === "top" ? { top: "100%", marginTop: 8 } : { bottom: "100%", marginBottom: 8 }),
              }}
            >
              <PanelBusqueda
                busqueda={busqueda}
                maxAlto={maxAltoPanel}
                onIrA={irA}
                onVerTodo={() => irA(busqueda.intencion ? "/catalogo" : `/catalogo?query=${encodeURIComponent(texto.trim())}`)}
                onPreguntar={() => irA(`/blue-ia?q=${encodeURIComponent(texto.trim())}`)}
              />
            </View>
          </View>
        </Animated.View>
      ) : null}
    </>
  );
}
