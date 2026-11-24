/**
 * Archivo: components/panel/google.tsx (app/admin/google.tsx la descarga al abrirla)
 * Función: pantalla de administración «Google», en la dirección /admin/google.
 * Para qué sirve: el dueño ve cómo le encuentran en Google sin entrar en Search Console (dueño, 2026-11-24: «lo
 *   trackeamos así en VeoAura… ¿podemos hacerlo con nuestro diseño?»): clics, veces que sale, porcentaje de clics y
 *   posición media, los clics por día, las búsquedas, las páginas, los países, los mapas de la web y «Comprobar una
 *   página en Google».
 * Conectado con: api/auditoria-web.ts (?accion=google, solo administrador; habla con Search Console con la llave de solo
 *   lectura GOOGLE_SEARCH_CONSOLE_CREDENCIALES), components/admin/PiezasPanelAdmin.tsx, lib/admin/productos.componentes.tsx,
 *   components/panel/index.tsx (tarjeta «Google» en «Tienda y marca»), pruebas/perfil-datos.mjs (GSC).
 * Dependencias: react, react-native.
 * Estado: ACTIVO
 *
 * Notas:
 * - Los datos los da Google con 2-3 días de retraso; con la web recién verificada tardan unos días en salir.
 * - Sin la llave o sin permiso en Search Console, lo explica con el paso que falta (nunca un error técnico).
 * - Mejoras del 2026-11-24: cada cifra se compara con el periodo anterior; el gráfico tiene escala, fechas y dice el día
 *   tocado; las búsquedas se filtran (Zaragoza, Vender, Reparar); «Casi en la primera página» (puestos 8 a 20); «Con qué
 *   te buscan» (móvil, ordenador, tableta); «Comprobar todas», con el último resultado guardado en este navegador.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Animated, Modal, Platform, Pressable, ScrollView, StatusBar, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { AvisoPanel, CabeceraPanel, CargandoPanel } from "../../lib/admin/productos.componentes";
import { CAMPO, TACTIL, TAMANOS } from "../../constants/temaTienda";
import { AccionTexto, Bloque, Chip, Cifra, Detalle, EtiquetaColor, FilaCifras, PANEL, type Tono } from "../../components/admin/PiezasPanelAdmin";

type Fila = { clics: number; impresiones: number; ctr: number; posicion: number };
type Mapa = { ruta: string; ultimaLectura: string | null; enviadoEn: string | null; pendiente: boolean; errores: number; avisos: number; paginas: number };
type Datos = {
  conectado: true;
  desde: string;
  hasta: string;
  totales: Fila;
  /** El periodo con el que se comparan las cifras (los mismos días del mes anterior, o los mismos días justo antes). */
  anterior?: { desde: string; hasta: string; totales: Fila };
  porDia: (Fila & { fecha: string })[];
  busquedas: (Fila & { texto: string })[];
  paginas: (Fila & { url: string })[];
  paises: (Fila & { pais: string })[];
  dispositivos?: (Fila & { dispositivo: string })[];
  mapas: Mapa[];
};
type SinConexion = { conectado: false; motivo: "sin_llave" | "llave_mal" | "sin_permiso" | "error" };
type Inspeccion = { ruta: string; enGoogle: boolean; estado: string; ultimaVisita: string | null; canonicaGoogle: string | null; robots: string; descarga: string; comprobadoEn?: number };

// --- «Rango personalizado» (dueño, 2026-11-24: «un selector de fechas igual que el de VeoAura») ----------------------
// Una barra «‹ periodo ›» (por defecto el mes actual; «›» no pasa del mes actual) y, al tocar el centro, una ventana con
// «Desde» y «Hasta» que abren el calendario del sistema y se aplican al momento. Fechas AAAA-MM-DD en hora local.
// Ajustes a las normas de la tienda: ningún texto de menos de 13 px (la invitación y el título van a 13 px) y, si la
// invitación entera no cabe a 13 px (móvil), dice «TOCA Y ELIGE TU RANGO».
type Rango = { desde: string; hasta: string };
const dos = (n: number) => String(n).padStart(2, "0");
const isoLocal = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const deIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const mesCompleto = (y: number, m: number): Rango => ({ desde: isoLocal(new Date(y, m, 1)), hasta: isoLocal(new Date(y, m + 1, 0)) });
const mesActual = (): Rango => {
  const h = new Date();
  return mesCompleto(h.getFullYear(), h.getMonth());
};
const esMesCompleto = (r: Rango) => {
  const d = deIso(r.desde);
  return d.getDate() === 1 && r.hasta === mesCompleto(d.getFullYear(), d.getMonth()).hasta;
};
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const mayus = (t: string) => t.replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
function textoRango(r: Rango): string {
  const a = deIso(r.desde);
  const b = deIso(r.hasta);
  const actual = mesActual();
  if (r.desde === actual.desde && r.hasta === actual.hasta) {
    const h = new Date();
    return mayus(`${DIAS_SEMANA[h.getDay()]} ${h.getDate()} de ${MESES[h.getMonth()]} del ${h.getFullYear()}`);
  }
  if (esMesCompleto(r)) return mayus(`${MESES[a.getMonth()]} del ${a.getFullYear()}`);
  if (a.getFullYear() !== b.getFullYear()) return `${a.getDate()} ${MESES_CORTOS[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MESES_CORTOS[b.getMonth()]} ${b.getFullYear()}`;
  if (a.getMonth() !== b.getMonth()) return `${a.getDate()} ${MESES_CORTOS[a.getMonth()]} – ${b.getDate()} ${MESES_CORTOS[b.getMonth()]} ${b.getFullYear()}`;
  return `${a.getDate()} – ${b.getDate()} ${MESES_CORTOS[b.getMonth()]} ${b.getFullYear()}`;
}
const fechaCaja = (s: string) => {
  const d = deIso(s);
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;
};
// ¿Cabe este texto en una línea de `ancho` px? (se mide con la letra de la tienda; fuera de la web, se supone que sí)
const LETRA = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
let lienzo: CanvasRenderingContext2D | null = null;
function anchoTexto(texto: string, px: number, peso: number, espaciado: number): number {
  if (Platform.OS !== "web" || typeof document === "undefined") return 0;
  lienzo ??= document.createElement("canvas").getContext("2d");
  if (!lienzo) return 0;
  lienzo.font = `${peso} ${px}px ${LETRA}`;
  return lienzo.measureText(texto).width + espaciado * texto.length;
}
const INVITACION = "CLICK Y SELECCIONA RANGO PERSONALIZADO";
const INVITACION_CORTA = "TOCA Y ELIGE TU RANGO";
const BORDE_BARRA = "rgba(15,23,42,0.14)";
const RAYITA = "rgba(15,23,42,0.08)";

function CajaFecha({ etiqueta, valor, max, onElegir, nativeID }: { etiqueta: string; valor: string; max: string; onElegir: (v: string) => void; nativeID: string }) {
  const [activa, setActiva] = useState(false);
  return (
    <View
      nativeID={nativeID}
      style={{ height: 48, borderRadius: 10, borderWidth: 1, borderColor: activa ? PANEL.accent : PANEL.border, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", position: "relative" }}
    >
      <Text style={{ color: PANEL.text, fontSize: 16, fontWeight: "600" }}>
        {etiqueta} · {fechaCaja(valor)}
      </Text>
      {Platform.OS === "web"
        ? // El calendario del sistema: un campo de fecha invisible que cubre la caja (el texto lo pinta la tienda).
          React.createElement("input", {
            type: "date",
            value: valor,
            max,
            "aria-label": etiqueta,
            "data-caja": nativeID,
            onChange: (e: { target: { value: string } }) => e.target.value && onElegir(e.target.value),
            onFocus: () => setActiva(true),
            onBlur: () => setActiva(false),
            onClick: (e: { currentTarget: { showPicker?: () => void } }) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {
                // sin showPicker (o ya abierto): el navegador abre el suyo
              }
            },
            style: { position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: 0, padding: 0, margin: 0 },
          })
        : null}
    </View>
  );
}

function SelectorRango({ rango, onCambiar, enFila = false }: { rango: Rango; onCambiar: (r: Rango) => void; enFila?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const [invitar, setInvitar] = useState(false);
  const [anchoCentro, setAnchoCentro] = useState(0);
  const [opacidad] = useState(() => new Animated.Value(1));
  const actual = mesActual();
  const esActual = rango.desde === actual.desde && rango.hasta === actual.hasta;
  const hoy = isoLocal(new Date());
  const desde = deIso(rango.desde);
  const enMesActual = desde.getFullYear() === new Date().getFullYear() && desde.getMonth() === new Date().getMonth();

  // La invitación: solo con el mes actual completo, a los 7 s, con un fundido; al cambiar de periodo, vuelta a empezar.
  useEffect(() => {
    opacidad.setValue(1);
    setInvitar(false);
    if (!esActual) return;
    const t = setTimeout(() => {
      Animated.timing(opacidad, { toValue: 0, duration: 160, useNativeDriver: Platform.OS !== "web" }).start(() => {
        setInvitar(true);
        Animated.timing(opacidad, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== "web" }).start();
      });
    }, 7000);
    return () => clearTimeout(t);
  }, [rango.desde, rango.hasta, esActual, opacidad]);

  // Escape cierra la ventana.
  useEffect(() => {
    if (!abierta || Platform.OS !== "web" || typeof window === "undefined") return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierta(false);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierta]);

  const texto = textoRango(rango);
  // La letra baja hasta que quepa en una línea (fecha: 16 → 13 px; invitación: 13 px, y si no cabe, la corta).
  const disponible = Math.max(0, anchoCentro - 16);
  let px = 16;
  while (disponible && px > 13 && anchoTexto(texto, px, 800, 0) > disponible) px -= 0.5;
  const invitacion = disponible && anchoTexto(INVITACION, 13, 900, 0.8) > disponible ? INVITACION_CORTA : INVITACION;
  const mover = (paso: number) => onCambiar(mesCompleto(desde.getFullYear(), desde.getMonth() + paso));
  const elegir = (campo: keyof Rango, v: string) => {
    const r = { ...rango, [campo]: v };
    onCambiar(r.desde > r.hasta ? { desde: r.hasta, hasta: r.desde } : r);
  };
  const flecha = (signo: string, nombre: string, onPress: () => void, desactivada: boolean, nativeID: string) => (
    <Pressable
      nativeID={nativeID}
      onPress={desactivada ? undefined : onPress}
      disabled={desactivada}
      accessibilityRole="button"
      accessibilityLabel={nombre}
      accessibilityState={{ disabled: desactivada }}
      style={({ pressed }) => ({ width: 40, alignItems: "center", justifyContent: "center", opacity: desactivada ? 0.38 : pressed ? 0.7 : 1 })}
    >
      <Text style={{ color: PANEL.text, fontSize: 28, fontWeight: "900", lineHeight: 32 }}>{signo}</Text>
    </Pressable>
  );
  const rayita = <View style={{ width: 1, marginVertical: 11, backgroundColor: RAYITA }} />;

  return (
    <>
      {/* En la fila del ordenador ocupa el hueco central (hasta 560 px); en el móvil, todo el ancho. */}
      <View nativeID="google-rango" style={{ flexDirection: "row", height: 48, ...(enFila ? { flexGrow: 0, flexShrink: 1, flexBasis: 560, minWidth: 0 } : { width: "100%" }), maxWidth: 560, alignSelf: "center", borderWidth: 1, borderColor: BORDE_BARRA, borderRadius: 12, backgroundColor: "#FFFFFF", overflow: "hidden" }}>
        {flecha("‹", "Rango anterior", () => mover(-1), false, "google-rango-anterior")}
        {rayita}
        <Pressable
          nativeID="google-rango-centro"
          onPress={() => setAbierta(true)}
          onLayout={(e) => setAnchoCentro(e.nativeEvent.layout.width)}
          accessibilityRole="button"
          accessibilityLabel={`Rango seleccionado: ${texto}. Toca para elegir un rango personalizado`}
          style={({ pressed }) => ({ flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, opacity: pressed ? 0.7 : 1 })}
        >
          <Animated.Text
            nativeID="google-rango-texto"
            numberOfLines={1}
            style={[
              { opacity: opacidad, textAlign: "center" },
              invitar
                ? { color: PANEL.accentDark, fontSize: 13, fontWeight: "900", letterSpacing: 0.8 }
                : { color: PANEL.text, fontSize: px, fontWeight: "800" },
            ]}
          >
            {invitar ? invitacion : texto}
          </Animated.Text>
        </Pressable>
        {rayita}
        {flecha("›", "Rango siguiente", () => mover(1), enMesActual, "google-rango-siguiente")}
      </View>

      <Modal visible={abierta} transparent animationType="fade" onRequestClose={() => setAbierta(false)}>
        <Pressable
          nativeID="google-rango-fondo"
          onPress={() => setAbierta(false)}
          accessibilityLabel="Cerrar el rango personalizado"
          style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.48)", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <Pressable
            nativeID="google-rango-ventana"
            onPress={() => {}}
            accessibilityRole="none"
            style={{ width: "100%", maxWidth: 380, borderRadius: 20, borderWidth: 1, borderColor: PANEL.border, backgroundColor: "#FFFFFF", padding: 22, shadowColor: "#0F172A", shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8, ...(Platform.OS === "web" ? ({ cursor: "default" } as object) : {}) }}
          >
            <Text style={{ color: PANEL.accentDark, fontSize: 13, fontWeight: "900", letterSpacing: 1.2, textAlign: "center", textTransform: "uppercase" }}>Rango personalizado</Text>
            <View style={{ gap: 12, marginTop: 12 }}>
              <CajaFecha nativeID="google-rango-desde" etiqueta="Desde" valor={rango.desde} max={hoy} onElegir={(v) => elegir("desde", v)} />
              <CajaFecha nativeID="google-rango-hasta" etiqueta="Hasta" valor={rango.hasta} max={hoy} onElegir={(v) => elegir("hasta", v)} />
            </View>
            <Pressable
              nativeID="google-rango-listo"
              onPress={() => setAbierta(false)}
              accessibilityRole="button"
              style={({ pressed }) => ({ marginTop: 20, minHeight: 48, borderRadius: 12, backgroundColor: PANEL.accent, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.98 : 1 }] })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>Listo</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const MOTIVOS: Record<SinConexion["motivo"], string> = {
  sin_llave: "Falta conectar Google: hay que guardar en Vercel la llave de solo lectura de Search Console (GOOGLE_SEARCH_CONSOLE_CREDENCIALES). Claude te da los pasos.",
  llave_mal: "La llave de Google guardada en Vercel no es válida o está incompleta: vuelve a pegar el archivo JSON entero de la llave.",
  sin_permiso: "Google no deja leer los datos todavía: en Search Console → Ajustes → Usuarios y permisos, añade el correo de la llave (termina en «iam.gserviceaccount.com») con permiso «Restringido».",
  error: "Google no ha respondido ahora mismo. Prueba a actualizar en unos minutos.",
};

// Por qué una página no está en Google, en español sencillo (la etiqueta ya dice «No está»).
function motivoEnEspanol(estado: string): string {
  const e = estado.toLowerCase();
  if (e.includes("unknown")) return "Google aún no la conoce.";
  if (e.includes("discovered")) return "Google la conoce pero aún no la ha guardado (suele tardar unos días).";
  if (e.includes("crawled")) return "Google la ha visitado pero aún no la ha guardado.";
  if (e.includes("noindex")) return "La página le pide a Google que no la guarde.";
  if (e.includes("robots")) return "robots.txt no le deja entrar.";
  if (e.includes("duplicate") || e.includes("canonical")) return "Google la considera una copia de otra página.";
  if (e.includes("redirect")) return "Es una redirección a otra página.";
  if (e.includes("404") || e.includes("not found")) return "Google no la encuentra (error 404).";
  return estado ? `Motivo que da Google: ${estado}.` : "Google no da el motivo.";
}

// «Comprobar una página»: el último resultado de cada una se guarda en este navegador, con su hora, para verlo al
// entrar sin volver a preguntar (comodidad del administrador; si el navegador no deja guardar, no pasa nada).
const CLAVE_COMPROBACIONES = "vz-google-comprobaciones";
function leerComprobaciones(): Record<string, Inspeccion> {
  try {
    if (Platform.OS !== "web" || typeof localStorage === "undefined") return {};
    const j = JSON.parse(localStorage.getItem(CLAVE_COMPROBACIONES) ?? "{}");
    return j && typeof j === "object" ? (j as Record<string, Inspeccion>) : {};
  } catch {
    return {};
  }
}
function guardarComprobacion(i: Inspeccion) {
  try {
    if (Platform.OS !== "web" || typeof localStorage === "undefined") return;
    localStorage.setItem(CLAVE_COMPROBACIONES, JSON.stringify({ ...leerComprobaciones(), [i.ruta]: i }));
  } catch {
    // sin guardar: se verá al comprobar otra vez
  }
}

// «frente a octubre» (mes completo) o «frente al 1–24 oct» (otro periodo).
function frenteA(desde: string, hasta: string): string {
  const a = deIso(desde);
  const b = deIso(hasta);
  if (esMesCompleto({ desde, hasta })) return `frente a ${MESES[a.getMonth()]}`;
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return `frente al ${a.getDate()}–${b.getDate()} ${MESES_CORTOS[a.getMonth()]}`;
  return `frente al ${a.getDate()} ${MESES_CORTOS[a.getMonth()]} – ${b.getDate()} ${MESES_CORTOS[b.getMonth()]}`;
}
const coma1 = (n: number) => n.toFixed(1).replace(".", ",");

// La comparación de una cifra con el periodo anterior: ▲ en verde si mejora, ▼ en rojo si empeora.
// En la posición, menos es mejor (puesto 5 es mejor que puesto 9).
function Comparacion({ id, tipo, ahora, antes, frente, sinAntes }: { id: string; tipo: "numero" | "porcentaje" | "posicion"; ahora: number; antes: number; frente: string; sinAntes: boolean }) {
  let linea: string;
  let color: string = PANEL.muted;
  if (sinAntes || (tipo === "posicion" && (!ahora || !antes))) {
    linea = "Antes, sin datos";
  } else {
    const d = tipo === "posicion" ? antes - ahora : tipo === "porcentaje" ? (ahora - antes) * 100 : ahora - antes;
    const igual = tipo === "numero" ? Math.round(d) === 0 : Math.abs(d) < 0.05;
    if (igual) linea = "= Igual";
    else {
      const valor = tipo === "numero" ? numero(Math.abs(d)) : coma1(Math.abs(d));
      linea =
        tipo === "posicion"
          ? `${d > 0 ? "▲" : "▼"} ${valor} ${valor === "1,0" ? "puesto" : "puestos"} ${d > 0 ? "mejor" : "peor"}`
          : `${d > 0 ? "▲ +" : "▼ −"}${valor}${tipo === "porcentaje" ? " puntos" : ""}`;
      color = d > 0 ? PANEL.success : PANEL.danger;
    }
  }
  return (
    <View nativeID={id} style={{ alignItems: "center", marginTop: 2 }}>
      <Text style={{ color, fontWeight: "900", fontSize: TAMANOS.minimo, lineHeight: 17, textAlign: "center" }}>{linea}</Text>
      <Text numberOfLines={2} style={{ color: PANEL.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 17, textAlign: "center" }}>
        {frente}
      </Text>
    </View>
  );
}

// Filtros de «Búsquedas» (dueño, 2026-11-24: saber si le encuentran quienes buscan vender o reparar en Zaragoza).
const sinTildes = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const FILTROS_BUSQUEDA: { clave: string; nombre: string; re: RegExp | null }[] = [
  { clave: "todas", nombre: "Todas", re: null },
  { clave: "zaragoza", nombre: "Zaragoza", re: /zaragoza|\bzgz\b/ },
  { clave: "vender", nombre: "Vender", re: /vend|venta|tasa|compran/ },
  { clave: "reparar", nombre: "Reparar", re: /repar|arregl|servicio tecnico/ },
];
const DISPOSITIVOS: Record<string, string> = { MOBILE: "Móvil", DESKTOP: "Ordenador", TABLET: "Tableta" };

const PAISES: Record<string, string> = {
  ESP: "España", MEX: "México", ARG: "Argentina", COL: "Colombia", CHL: "Chile", PER: "Perú", USA: "Estados Unidos",
  FRA: "Francia", ITA: "Italia", PRT: "Portugal", GBR: "Reino Unido", DEU: "Alemania", AND: "Andorra", VEN: "Venezuela",
};
const PAGINAS_CLAVE: [string, string][] = [
  ["Portada", "/"],
  ["Vender", "/vender"],
  ["Catálogo", "/catalogo"],
  ["Servicios", "/servicios"],
  ["Quiénes somos", "/quienes-somos"],
  ["Noticias", "/noticias"],
];

const numero = (n: number) => Math.round(n).toLocaleString("es-ES");
const porcentaje = (n: number) => `${(n * 100).toFixed(1).replace(".", ",")} %`;
const posicion = (n: number) => (n > 0 ? n.toFixed(1).replace(".", ",") : "Sin datos");
const fechaCorta = (iso: string | null) => {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" }).format(new Date(t)) : "—";
};
const ruta = (url: string) => url.replace(/^https?:\/\/(www\.)?videojuegoszaragoza\.com/, "") || "/";

async function pedirGoogle(params: string): Promise<any> {
  const { data: s } = await supabase.auth.getSession();
  const r = await fetch(`/api/auditoria-web?accion=google&${params}`, { headers: { Authorization: `Bearer ${s.session?.access_token ?? ""}` } });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

function FilaTabla({ izquierda, derecha, nativeID }: { izquierda: React.ReactNode; derecha: string; nativeID?: string }) {
  return (
    <View nativeID={nativeID} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: PANEL.border }}>
      <View style={{ flex: 1, minWidth: 0 }}>{izquierda}</View>
      <Text style={{ color: PANEL.muted, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "right" }}>{derecha}</Text>
    </View>
  );
}

export default function AdminGoogle() {
  const { width } = useWindowDimensions();
  const isMobile = (width && width > 0 ? width : 1024) < 700;
  const insets = useSafeAreaInsets();
  const [rango, setRango] = useState<Rango>(mesActual);
  const [infoAbierta, setInfoAbierta] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [datos, setDatos] = useState<Datos | SinConexion | null>(null);
  const [fallo, setFallo] = useState(false);
  const [actualizadoEn, setActualizadoEn] = useState<number | null>(null);
  const [inspecciones, setInspecciones] = useState<Record<string, Inspeccion | "cargando" | "error">>(leerComprobaciones);
  const [comprobandoTodas, setComprobandoTodas] = useState(false);
  const [otra, setOtra] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [diaSel, setDiaSel] = useState<string | null>(null);

  const cargar = useCallback(async (r: Rango) => {
    setCargando(true);
    setFallo(false);
    try {
      setDatos(await pedirGoogle(`desde=${r.desde}&hasta=${r.hasta}`));
      setActualizadoEn(Date.now());
    } catch {
      setFallo(true);
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    void cargar(rango);
  }, [rango, cargar]);

  const comprobar = useCallback(async (r: string) => {
    const limpia = r.trim().replace(/^https?:\/\/(www\.)?videojuegoszaragoza\.com/, "") || "/";
    if (!limpia.startsWith("/")) return;
    setInspecciones((x) => ({ ...x, [limpia]: "cargando" }));
    try {
      const j = await pedirGoogle(`inspeccionar=${encodeURIComponent(limpia)}`);
      if (j?.conectado === false) {
        setInspecciones((x) => ({ ...x, [limpia]: "error" }));
        return;
      }
      const i: Inspeccion = { ...(j as Inspeccion), ruta: limpia, comprobadoEn: Date.now() };
      guardarComprobacion(i);
      setInspecciones((x) => ({ ...x, [limpia]: i }));
    } catch {
      setInspecciones((x) => ({ ...x, [limpia]: "error" }));
    }
  }, []);
  // «Comprobar todas»: una detrás de otra (Google limita las consultas seguidas).
  const comprobarTodas = useCallback(async () => {
    setComprobandoTodas(true);
    for (const [, r] of PAGINAS_CLAVE) await comprobar(r);
    setComprobandoTodas(false);
  }, [comprobar]);

  const conectado = datos && datos.conectado ? datos : null;
  // Una barra por cada día del periodo (los que Google no trae, a 0): con pocos días de datos no sale un bloque enorme.
  const dias: (Fila & { fecha: string })[] = [];
  if (conectado) {
    const porFecha = new Map(conectado.porDia.map((d) => [d.fecha, d]));
    for (let t = Date.parse(`${conectado.desde}T00:00:00Z`), fin = Date.parse(`${conectado.hasta}T00:00:00Z`); t <= fin && dias.length < 500; t += 86400000) {
      const fecha = new Date(t).toISOString().slice(0, 10);
      dias.push(porFecha.get(fecha) ?? { fecha, clics: 0, impresiones: 0, ctr: 0, posicion: 0 });
    }
  }
  const maxDia = Math.max(1, ...dias.map((d) => d.impresiones));
  const dia = dias.find((d) => d.fecha === diaSel) ?? null;
  const fechaEje = (iso: string) => {
    const d = deIso(iso);
    return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
  };
  const textoDia = (d: Fila & { fecha: string }) => {
    const f = deIso(d.fecha);
    const nombre = `${DIAS_SEMANA[f.getDay()]} ${f.getDate()} ${MESES_CORTOS[f.getMonth()]}`;
    return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)}: ${numero(d.clics)} ${d.clics === 1 ? "clic" : "clics"} · ${numero(d.impresiones)} ${d.impresiones === 1 ? "vez" : "veces"}${d.posicion > 0 ? ` · puesto ${posicion(d.posicion)}` : ""}`;
  };
  // Búsquedas: con el filtro elegido, las 15 primeras; «casi en la primera página», las de los puestos 8 a 20.
  const filtroActivo = FILTROS_BUSQUEDA.find((f) => f.clave === filtro) ?? FILTROS_BUSQUEDA[0];
  const cuantas = (re: RegExp | null) => (conectado ? (re ? conectado.busquedas.filter((b) => re.test(sinTildes(b.texto))).length : conectado.busquedas.length) : 0);
  const busquedasVistas = conectado ? conectado.busquedas.filter((b) => !filtroActivo.re || filtroActivo.re.test(sinTildes(b.texto))).slice(0, 15) : [];
  const casiPrimera = conectado
    ? conectado.busquedas.filter((b) => b.posicion >= 8 && b.posicion <= 20).sort((a, b) => b.impresiones - a.impresiones).slice(0, 8)
    : [];
  const totalDispositivos = conectado ? Math.max(1, (conectado.dispositivos ?? []).reduce((s, d) => s + d.impresiones, 0)) : 1;
  const sinAntes = !conectado?.anterior || (conectado.anterior.totales.impresiones === 0 && conectado.anterior.totales.clics === 0);
  const frente = conectado?.anterior ? frenteA(conectado.anterior.desde, conectado.anterior.hasta) : "";
  // Sin datos del periodo anterior no se repite en cada cifra: lo dice una sola línea debajo.
  const comparar = (id: string, tipo: "numero" | "porcentaje" | "posicion", campo: keyof Fila) =>
    conectado?.anterior && !sinAntes ? <Comparacion id={id} tipo={tipo} ahora={conectado.totales[campo]} antes={conectado.anterior.totales[campo]} frente={frente} sinAntes={sinAntes} /> : null;
  // Ordenador ancho (dueño, 2026-11-24: «aprovechar mejor el ancho»): hasta 1440 px, gráfico con los mapas al lado,
  // búsquedas, páginas y países en tres columnas y «Comprobar» en cuadrícula. Ordenador normal: dos columnas.
  const muyAncho = (width && width > 0 ? width : 1024) >= 1180;
  const anchoBloque = isMobile ? "100%" : muyAncho ? "31%" : "45%";
  const anchoComprobar = isMobile ? "100%" : muyAncho ? "31%" : "45%";

  // «Mapas de la web»: al lado del gráfico en el ordenador ancho; si no, con los demás bloques.
  const bloqueMapas = (ancho: "100%" | "45%" | "32%" | "31%") =>
    conectado ? (
      <Bloque nativeID="google-mapas" icono="map-outline" titulo="Mapas de la web" ancho={ancho}>
        {conectado.mapas.length ? (
          conectado.mapas.map((m) => {
            const t: { texto: string; tono: Tono } = m.errores ? { texto: "Con errores", tono: "rojo" } : m.pendiente || !m.ultimaLectura ? { texto: "Pendiente", tono: "amarillo" } : { texto: "Correcto", tono: "verde" };
            return (
              <FilaTabla
                key={m.ruta}
                izquierda={
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: PANEL.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>{m.ruta}</Text>
                    <EtiquetaColor texto={t.texto} tono={t.tono} />
                  </View>
                }
                derecha={`${numero(m.paginas)} páginas · leído ${fechaCorta(m.ultimaLectura)}`}
              />
            );
          })
        ) : (
          <Detalle>No hay mapas enviados en Search Console.</Detalle>
        )}
      </Bloque>
    ) : null;

  // «Casi en la primera página»: las búsquedas en los puestos 8 a 20, las más vistas primero. Son las más fáciles de subir.
  const bloqueCasi = (ancho: "100%" | "45%" | "31%") =>
    conectado ? (
      <Bloque nativeID="google-casi" icono="trending-up-outline" titulo="Casi en la primera página" ancho={ancho}>
        <Detalle>Búsquedas en los puestos 8 a 20: con un empujón (más texto en esa página o un artículo en Noticias) pueden subir arriba.</Detalle>
        {casiPrimera.length ? (
          casiPrimera.map((b) => (
            <FilaTabla
              key={b.texto}
              izquierda={<Text style={{ color: PANEL.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>{b.texto}</Text>}
              derecha={`puesto ${posicion(b.posicion)} · ${numero(b.impresiones)} veces`}
            />
          ))
        ) : (
          <Detalle color={PANEL.text}>Ninguna búsqueda en esos puestos todavía.</Detalle>
        )}
      </Bloque>
    ) : null;

  const horaCorta = (t: number) =>
    new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(t));
  const resultadoInspeccion = (r: string) => {
    const i = inspecciones[r];
    if (!i) return null;
    if (i === "cargando") return <Text style={{ color: PANEL.muted, fontSize: TAMANOS.minimo }}>Preguntando a Google…</Text>;
    if (i === "error") return <Text style={{ color: PANEL.danger, fontSize: TAMANOS.minimo, fontWeight: "700" }}>No se ha podido comprobar ahora. Prueba en unos minutos.</Text>;
    return (
      <View nativeID={`google-inspeccion-${r === "/" ? "portada" : r.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`} style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <EtiquetaColor texto={i.enGoogle ? "✔ En Google" : "✖ No está"} tono={i.enGoogle ? "verde" : "amarillo"} />
          {i.enGoogle ? null : <Text style={{ flexShrink: 1, color: PANEL.text, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18 }}>{motivoEnEspanol(i.estado)}</Text>}
        </View>
        <Text style={{ color: PANEL.muted, fontSize: TAMANOS.minimo, lineHeight: 18 }}>
          Última visita de Google: {fechaCorta(i.ultimaVisita)}
          {i.canonicaGoogle && ruta(i.canonicaGoogle) !== r ? ` · Google prefiere ${ruta(i.canonicaGoogle)}` : ""}
          {i.comprobadoEn ? ` · comprobado el ${horaCorta(i.comprobadoEn)}` : ""}
        </Text>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: PANEL.bg }}>
      <StatusBar barStyle="dark-content" />
      <CabeceraPanel title="Google" isMobile={isMobile} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 48 + insets.bottom, alignItems: "center" }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={{ width: "100%", maxWidth: muyAncho ? 1440 : 1040, gap: isMobile ? 18 : 22 }}>
          {/* Barra de arriba (dueño, 2026-11-24): «Conectado», el rango y «Actualizar» a la misma altura, y la explicación y
              la hora de la última lectura recogidas en el icono ⓘ. En el móvil, el rango va debajo a todo el ancho. */}
          {(() => {
            const estado = (
              <View nativeID="google-estado" style={{ flexDirection: "row", alignItems: "center" }}>
                {conectado ? (
                  <EtiquetaColor texto="Conectado" tono={"verde" as Tono} />
                ) : datos && !datos.conectado ? (
                  <EtiquetaColor texto="Sin conectar" tono={"amarillo" as Tono} />
                ) : null}
              </View>
            );
            const acciones = (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <AccionTexto nativeID="google-actualizar" icono="refresh-outline" texto="Actualizar" onPress={() => void cargar(rango)} disabled={cargando} />
                <Pressable
                  nativeID="google-info"
                  onPress={() => setInfoAbierta((x) => !x)}
                  accessibilityRole="button"
                  accessibilityLabel="Información sobre estos datos"
                  accessibilityState={{ expanded: infoAbierta }}
                  {...({ "aria-expanded": infoAbierta } as object)}
                  style={({ pressed }) => ({ width: TACTIL.minimo, height: TACTIL.minimo, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
                >
                  <Ionicons name={infoAbierta ? "information-circle" : "information-circle-outline"} size={24} color={PANEL.accentDark} />
                </Pressable>
              </View>
            );
            return isMobile ? (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  {estado}
                  {acciones}
                </View>
                <SelectorRango rango={rango} onCambiar={setRango} />
              </View>
            ) : (
              <View nativeID="google-barra" style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }}>
                <View style={{ flex: 1, minWidth: 0, alignItems: "flex-start" }}>{estado}</View>
                <SelectorRango rango={rango} onCambiar={setRango} enFila />
                <View style={{ flex: 1, minWidth: 0, alignItems: "flex-end" }}>{acciones}</View>
              </View>
            );
          })()}
          {infoAbierta ? (
            <View nativeID="google-info-texto" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 14, backgroundColor: PANEL.accent2, padding: 12, marginTop: isMobile ? -8 : -10 }}>
              <Ionicons name="information-circle-outline" size={18} color={PANEL.accentDark} style={{ marginTop: 1 }} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ color: PANEL.text, fontSize: TAMANOS.minimo, fontWeight: "700", lineHeight: 19 }}>
                  Cómo te encuentra la gente en Google (datos de Search Console). Google da los datos con 2 o 3 días de retraso.
                </Text>
                {actualizadoEn ? (
                  <Text style={{ color: PANEL.muted, fontSize: TAMANOS.minimo, fontWeight: "700" }}>
                    Actualizado a las {new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(actualizadoEn))}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {cargando && !datos ? <CargandoPanel texto="Preguntando a Google…" /> : null}
          {fallo ? <AvisoPanel tone="danger" text="No se ha podido hablar con Google ahora mismo. Prueba a actualizar en unos minutos." /> : null}
          {datos && !datos.conectado ? (
            <View nativeID="google-sin-conexion">
              <AvisoPanel tone="warning" text={MOTIVOS[datos.motivo] ?? MOTIVOS.error} />
            </View>
          ) : null}

          {conectado ? (
            <>
              <FilaCifras nativeID="google-cifras">
                <Cifra nativeID="google-cifra-clics" valor={numero(conectado.totales.clics)} etiqueta="Clics" icono="hand-left-outline" ancho={isMobile ? "45%" : 0} nota={comparar("google-cambio-clics", "numero", "clics")} />
                <Cifra nativeID="google-cifra-veces" valor={numero(conectado.totales.impresiones)} etiqueta="Veces que sales" icono="eye-outline" ancho={isMobile ? "45%" : 0} nota={comparar("google-cambio-veces", "numero", "impresiones")} />
                <Cifra nativeID="google-cifra-porcentaje" valor={porcentaje(conectado.totales.ctr)} etiqueta="Porcentaje de clics" icono="stats-chart-outline" ancho={isMobile ? "45%" : 0} nota={comparar("google-cambio-porcentaje", "porcentaje", "ctr")} />
                <Cifra nativeID="google-cifra-posicion" valor={posicion(conectado.totales.posicion)} etiqueta="Posición media" icono="podium-outline" ancho={isMobile ? "45%" : 0} nota={comparar("google-cambio-posicion", "posicion", "posicion")} />
              </FilaCifras>
              {conectado.anterior && sinAntes ? (
                <View nativeID="google-sin-comparar" style={{ marginTop: isMobile ? -8 : -10 }}>
                  <Detalle>Google no tiene datos {frente.replace(/^frente a/, "de")} para comparar: la comparación saldrá cuando los haya.</Detalle>
                </View>
              ) : null}

              {/* Clics y veces que sales, por día (barras: el alto es las veces que sales; lo azul, los clics). */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                <Bloque nativeID="google-por-dia" icono="calendar-outline" titulo="Clics por día" ancho={muyAncho ? "64%" : "100%"}>
                  {conectado.porDia.length ? (
                    <>
                      {/* El día elegido (al tocar una barra o pasar el ratón); si no, cómo elegirlo. */}
                      <Text nativeID="google-dia" style={{ color: dia ? PANEL.text : PANEL.muted, fontWeight: dia ? "800" : "700", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                        {dia ? textoDia(dia) : "Toca una barra (o pasa el ratón) para ver ese día."}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        {/* Escala: el máximo de veces arriba y 0 abajo. */}
                        <View style={{ height: muyAncho ? 150 : 110, justifyContent: "space-between", alignItems: "flex-end", minWidth: 22 }}>
                          <Text style={{ color: PANEL.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 15 }}>{numero(maxDia)}</Text>
                          <Text style={{ color: PANEL.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 15 }}>0</Text>
                        </View>
                        <View
                          nativeID="google-grafico"
                          accessibilityLabel={`Gráfico por días: como mucho ${numero(maxDia)} veces en un día`}
                          style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-end", gap: dias.length > 60 ? 1 : 2, height: muyAncho ? 150 : 110, borderTopWidth: 1, borderTopColor: PANEL.border, borderStyle: "dashed", borderBottomWidth: 1, borderBottomColor: PANEL.border }}
                        >
                          {dias.map((d) => {
                            const elegido = d.fecha === diaSel;
                            return (
                              <Pressable
                                key={d.fecha}
                                nativeID={`google-barra-${d.fecha}`}
                                focusable={false}
                                onPress={() => setDiaSel(d.fecha)}
                                onHoverIn={() => setDiaSel(d.fecha)}
                                accessibilityLabel={textoDia(d)}
                                style={{ flex: 1, minWidth: 1, height: "100%", justifyContent: "flex-end", ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : {}) }}
                              >
                                <View
                                  style={{
                                    height: d.impresiones ? `${Math.max(4, (d.impresiones / maxDia) * 100)}%` : 2,
                                    borderRadius: 3,
                                    backgroundColor: elegido ? PANEL.accentDark : d.impresiones ? PANEL.accentBorder : PANEL.border,
                                    justifyContent: "flex-end",
                                    overflow: "hidden",
                                  }}
                                >
                                  <View style={{ height: `${d.impresiones ? (d.clics / d.impresiones) * 100 : 0}%`, minHeight: d.clics ? 3 : 0, backgroundColor: PANEL.accent }} />
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                      {/* Fechas debajo: el primer día, el del medio y el último. */}
                      {dias.length ? (
                        <View nativeID="google-eje" style={{ flexDirection: "row", justifyContent: "space-between", paddingLeft: 28 }}>
                          <Text style={{ color: PANEL.muted, fontWeight: "700", fontSize: TAMANOS.minimo }}>{fechaEje(dias[0].fecha)}</Text>
                          {dias.length > 2 ? <Text style={{ color: PANEL.muted, fontWeight: "700", fontSize: TAMANOS.minimo }}>{fechaEje(dias[Math.floor(dias.length / 2)].fecha)}</Text> : null}
                          <Text style={{ color: PANEL.muted, fontWeight: "700", fontSize: TAMANOS.minimo }}>{fechaEje(dias[dias.length - 1].fecha)}</Text>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <Detalle>Todavía no hay datos de días. Con la web recién conectada tardan unos días.</Detalle>
                  )}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", columnGap: 14, rowGap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: PANEL.accentBorder }} />
                      <Text style={{ color: PANEL.muted, fontWeight: "700", fontSize: TAMANOS.minimo }}>Veces que sales</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: PANEL.accent }} />
                      <Text style={{ color: PANEL.muted, fontWeight: "700", fontSize: TAMANOS.minimo }}>Clics</Text>
                    </View>
                  </View>
                </Bloque>
                {/* Ordenador ancho: a la derecha del gráfico, los mapas y «Casi en la primera página» (cada uno en su fila,
                    para que su ancho no se lea como alto). */}
                {muyAncho ? (
                  <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: "32%", minWidth: 0, gap: 12 }}>
                    <View style={{ flexDirection: "row" }}>{bloqueMapas("100%")}</View>
                    <View style={{ flexDirection: "row", flexGrow: 1 }}>{bloqueCasi("100%")}</View>
                  </View>
                ) : null}
              </View>

              {/* Siempre en fila que baja de línea: en una columna, el ancho de cada Bloque (flexBasis) se leería como alto. */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                <Bloque nativeID="google-busquedas" icono="search-outline" titulo="Búsquedas con las que te encuentran" ancho={anchoBloque}>
                  {conectado.busquedas.length ? (
                    <>
                      <View nativeID="google-filtros" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {FILTROS_BUSQUEDA.map((f) => (
                          <Chip key={f.clave} nativeID={`google-filtro-${f.clave}`} label={`${f.nombre} · ${cuantas(f.re)}`} activo={filtro === f.clave} onPress={() => setFiltro(f.clave)} />
                        ))}
                      </View>
                      {busquedasVistas.length ? (
                        busquedasVistas.map((b) => (
                          <FilaTabla
                            key={b.texto}
                            izquierda={<Text style={{ color: PANEL.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>{b.texto}</Text>}
                            derecha={`${numero(b.clics)} clics · ${numero(b.impresiones)} veces · puesto ${posicion(b.posicion)}`}
                          />
                        ))
                      ) : (
                        <Detalle color={PANEL.text}>Todavía no hay búsquedas de «{filtroActivo.nombre}».</Detalle>
                      )}
                    </>
                  ) : (
                    <Detalle>Todavía no hay búsquedas. Con la web recién conectada tardan unos días.</Detalle>
                  )}
                </Bloque>
                {muyAncho ? null : bloqueCasi(anchoBloque)}
                <Bloque nativeID="google-paginas" icono="document-text-outline" titulo="Páginas que más visitas traen" ancho={anchoBloque}>
                  {conectado.paginas.length ? (
                    conectado.paginas.map((p) => (
                      <FilaTabla
                        key={p.url}
                        izquierda={<Text numberOfLines={1} style={{ color: PANEL.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>{ruta(p.url)}</Text>}
                        derecha={`${numero(p.clics)} clics · ${numero(p.impresiones)} veces`}
                      />
                    ))
                  ) : (
                    <Detalle>Todavía no hay páginas con visitas desde Google.</Detalle>
                  )}
                </Bloque>
                <Bloque nativeID="google-paises" icono="earth-outline" titulo="Desde dónde te buscan" ancho={anchoBloque}>
                  {conectado.paises.length ? (
                    conectado.paises.map((p) => (
                      <FilaTabla key={p.pais} izquierda={<Text style={{ color: PANEL.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>{PAISES[p.pais] ?? p.pais}</Text>} derecha={`${numero(p.clics)} clics · ${numero(p.impresiones)} veces`} />
                    ))
                  ) : (
                    <Detalle>Sin datos todavía.</Detalle>
                  )}
                  {conectado.dispositivos?.length ? (
                    <View nativeID="google-dispositivos" style={{ gap: 6, marginTop: 6 }}>
                      <Text style={{ color: PANEL.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>Con qué te buscan</Text>
                      {conectado.dispositivos.map((d) => {
                        const parte = d.impresiones / totalDispositivos;
                        return (
                          <View key={d.dispositivo} style={{ gap: 4, paddingVertical: 4, borderTopWidth: 1, borderTopColor: PANEL.border }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                              <Text style={{ flex: 1, color: PANEL.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>{DISPOSITIVOS[d.dispositivo] ?? d.dispositivo}</Text>
                              <Text style={{ color: PANEL.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                                {numero(d.clics)} clics · {numero(d.impresiones)} veces · {Math.round(parte * 100)} %
                              </Text>
                            </View>
                            <View style={{ height: 6, borderRadius: 3, backgroundColor: PANEL.border, overflow: "hidden" }}>
                              <View style={{ width: `${Math.round(parte * 100)}%`, height: "100%", backgroundColor: PANEL.accent }} />
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </Bloque>
                {muyAncho ? null : bloqueMapas(anchoBloque)}
              </View>

              {/* Comprobar una página: las principales y cualquier otra. */}
              <View style={{ flexDirection: "row" }}>
                <Bloque nativeID="google-comprobar" icono="checkmark-done-outline" titulo="Comprobar una página en Google" ancho="100%">
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12 }}>
                    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 260, minWidth: 0 }}>
                      <Detalle>Dice si la página está en Google y, si no, por qué. El último resultado se queda guardado.</Detalle>
                    </View>
                    <AccionTexto
                      nativeID="google-comprobar-todas"
                      icono="checkmark-done-outline"
                      texto={comprobandoTodas ? "Comprobando…" : "Comprobar todas"}
                      onPress={() => void comprobarTodas()}
                      disabled={comprobandoTodas}
                    />
                  </View>
                  {/* En el ordenador, en cuadrícula (3 o 2 por fila); en el móvil, una debajo de otra. */}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: isMobile ? 0 : 10 }}>
                    {PAGINAS_CLAVE.map(([nombre, r]) => (
                      <View
                        key={r}
                        style={
                          isMobile
                            ? { width: "100%", gap: 2, paddingVertical: 4, borderTopWidth: 1, borderTopColor: PANEL.border }
                            : { flexGrow: 1, flexShrink: 1, flexBasis: anchoComprobar, minWidth: 0, gap: 2, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: PANEL.border, backgroundColor: PANEL.bg }
                        }
                      >
                        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10 }}>
                          <Text style={{ color: PANEL.text, fontWeight: "900", fontSize: TAMANOS.minimo, minWidth: 96 }}>{nombre}</Text>
                          <AccionTexto
                            nativeID={`google-comprobar-${r === "/" ? "portada" : r.slice(1)}`}
                            icono="search-outline"
                            texto="Comprobar"
                            etiqueta={`Comprobar ${nombre} en Google`}
                            onPress={() => void comprobar(r)}
                            disabled={inspecciones[r] === "cargando" || comprobandoTodas}
                          />
                        </View>
                        {resultadoInspeccion(r)}
                      </View>
                    ))}
                  </View>
                  <View style={{ gap: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: PANEL.border }}>
                    <Text style={{ color: PANEL.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>Otra página</Text>
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                      <TextInput
                        nativeID="google-otra"
                        value={otra}
                        onChangeText={setOtra}
                        placeholder="/producto/… o la dirección entera"
                        placeholderTextColor="rgba(11,33,56,0.45)"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={{ flex: 1, minWidth: 0, height: CAMPO.alto, fontSize: CAMPO.letra, borderWidth: 1, borderColor: PANEL.border, borderRadius: 12, paddingHorizontal: 12, color: PANEL.text, backgroundColor: PANEL.bg }}
                      />
                      <Pressable
                        nativeID="google-otra-comprobar"
                        onPress={() => void comprobar(otra)}
                        accessibilityRole="button"
                        accessibilityLabel="Comprobar esta página en Google"
                        style={({ pressed }) => ({ minHeight: TACTIL.minimo, minWidth: TACTIL.minimo, paddingHorizontal: 14, borderRadius: 999, backgroundColor: PANEL.accent, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
                      >
                        <Ionicons name="search" size={18} color="#FFFFFF" />
                      </Pressable>
                    </View>
                    {otra.trim() ? resultadoInspeccion(otra.trim().replace(/^https?:\/\/(www\.)?videojuegoszaragoza\.com/, "") || "/") : null}
                  </View>
                </Bloque>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
