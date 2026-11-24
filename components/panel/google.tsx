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
 */
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StatusBar, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { AvisoPanel, CabeceraPanel, CargandoPanel } from "../../lib/admin/productos.componentes";
import { CAMPO, TACTIL, TAMANOS } from "../../constants/temaTienda";
import { AccionTexto, Bloque, Chip, Cifra, Detalle, EtiquetaColor, FilaCifras, FilaPastillas, PANEL, type Tono } from "../../components/admin/PiezasPanelAdmin";

type Fila = { clics: number; impresiones: number; ctr: number; posicion: number };
type Mapa = { ruta: string; ultimaLectura: string | null; enviadoEn: string | null; pendiente: boolean; errores: number; avisos: number; paginas: number };
type Datos = {
  conectado: true;
  desde: string;
  hasta: string;
  totales: Fila;
  porDia: (Fila & { fecha: string })[];
  busquedas: (Fila & { texto: string })[];
  paginas: (Fila & { url: string })[];
  paises: (Fila & { pais: string })[];
  mapas: Mapa[];
};
type SinConexion = { conectado: false; motivo: "sin_llave" | "llave_mal" | "sin_permiso" | "error" };
type Inspeccion = { ruta: string; enGoogle: boolean; estado: string; ultimaVisita: string | null; canonicaGoogle: string | null; robots: string; descarga: string };

const PERIODOS = [
  [7, "7 días"],
  [28, "28 días"],
  [90, "3 meses"],
] as const;

const MOTIVOS: Record<SinConexion["motivo"], string> = {
  sin_llave: "Falta conectar Google: hay que guardar en Vercel la llave de solo lectura de Search Console (GOOGLE_SEARCH_CONSOLE_CREDENCIALES). Claude te da los pasos.",
  llave_mal: "La llave de Google guardada en Vercel no es válida o está incompleta: vuelve a pegar el archivo JSON entero de la llave.",
  sin_permiso: "Google no deja leer los datos todavía: en Search Console → Ajustes → Usuarios y permisos, añade el correo de la llave (termina en «iam.gserviceaccount.com») con permiso «Restringido».",
  error: "Google no ha respondido ahora mismo. Prueba a actualizar en unos minutos.",
};

// Lo que dice Google de una página, en español sencillo.
function estadoEnEspanol(estado: string, enGoogle: boolean): string {
  const e = estado.toLowerCase();
  if (enGoogle) return "Está en Google.";
  if (e.includes("unknown")) return "Google aún no la conoce.";
  if (e.includes("discovered")) return "Google la conoce pero aún no la ha guardado (suele tardar unos días).";
  if (e.includes("crawled")) return "Google la ha visitado pero aún no la ha guardado.";
  if (e.includes("noindex")) return "No está en Google: la página le pide que no la guarde.";
  if (e.includes("robots")) return "No está en Google: robots.txt no le deja entrar.";
  if (e.includes("duplicate") || e.includes("canonical")) return "Google la considera una copia de otra página.";
  if (e.includes("redirect")) return "Es una redirección a otra página.";
  if (e.includes("404") || e.includes("not found")) return "Google no la encuentra (error 404).";
  return estado ? `No está en Google: ${estado}.` : "No está en Google.";
}

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
  const [dias, setDias] = useState<7 | 28 | 90>(28);
  const [cargando, setCargando] = useState(true);
  const [datos, setDatos] = useState<Datos | SinConexion | null>(null);
  const [fallo, setFallo] = useState(false);
  const [actualizadoEn, setActualizadoEn] = useState<number | null>(null);
  const [inspecciones, setInspecciones] = useState<Record<string, Inspeccion | "cargando" | "error">>({});
  const [otra, setOtra] = useState("");

  const cargar = useCallback(async (d: number) => {
    setCargando(true);
    setFallo(false);
    try {
      setDatos(await pedirGoogle(`dias=${d}`));
      setActualizadoEn(Date.now());
    } catch {
      setFallo(true);
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    void cargar(dias);
  }, [dias, cargar]);

  const comprobar = useCallback(async (r: string) => {
    const limpia = r.trim().replace(/^https?:\/\/(www\.)?videojuegoszaragoza\.com/, "") || "/";
    if (!limpia.startsWith("/")) return;
    setInspecciones((x) => ({ ...x, [limpia]: "cargando" }));
    try {
      const j = await pedirGoogle(`inspeccionar=${encodeURIComponent(limpia)}`);
      setInspecciones((x) => ({ ...x, [limpia]: j?.conectado === false ? "error" : (j as Inspeccion) }));
    } catch {
      setInspecciones((x) => ({ ...x, [limpia]: "error" }));
    }
  }, []);

  const conectado = datos && datos.conectado ? datos : null;
  const maxDia = conectado ? Math.max(1, ...conectado.porDia.map((d) => d.impresiones)) : 1;
  const anchoBloque = isMobile ? "100%" : "45%";

  const resultadoInspeccion = (r: string) => {
    const i = inspecciones[r];
    if (!i) return null;
    if (i === "cargando") return <Text style={{ color: PANEL.muted, fontSize: TAMANOS.minimo }}>Preguntando a Google…</Text>;
    if (i === "error") return <Text style={{ color: PANEL.danger, fontSize: TAMANOS.minimo, fontWeight: "700" }}>No se ha podido comprobar ahora. Prueba en unos minutos.</Text>;
    return (
      <View nativeID={`google-inspeccion-${r === "/" ? "portada" : r.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`} style={{ gap: 2 }}>
        <Text style={{ color: i.enGoogle ? PANEL.success : PANEL.warning, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 18 }}>
          {estadoEnEspanol(i.estado, i.enGoogle)}
        </Text>
        <Text style={{ color: PANEL.muted, fontSize: TAMANOS.minimo, lineHeight: 18 }}>
          Última visita de Google: {fechaCorta(i.ultimaVisita)}
          {i.canonicaGoogle && ruta(i.canonicaGoogle) !== r ? ` · Google prefiere ${ruta(i.canonicaGoogle)}` : ""}
        </Text>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: PANEL.bg }}>
      <StatusBar barStyle="dark-content" />
      <CabeceraPanel title="Google" isMobile={isMobile} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 48 + insets.bottom, alignItems: "center" }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={{ width: "100%", maxWidth: 1040, gap: isMobile ? 18 : 22 }}>
          <Detalle>Cómo te encuentra la gente en Google (datos de Search Console). Google da los datos con 2 o 3 días de retraso.</Detalle>

          {/* Estado de la conexión, periodo y «Actualizar». */}
          <View nativeID="google-estado" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: 10, rowGap: 6 }}>
            {conectado ? (
              <EtiquetaColor texto="Conectado" tono={"verde" as Tono} />
            ) : datos && !datos.conectado ? (
              <EtiquetaColor texto="Sin conectar" tono={"amarillo" as Tono} />
            ) : null}
            {actualizadoEn ? (
              <Text style={{ color: PANEL.muted, fontSize: TAMANOS.minimo, fontWeight: "700" }}>
                Actualizado a las {new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(actualizadoEn))}
              </Text>
            ) : null}
            <AccionTexto nativeID="google-actualizar" icono="refresh-outline" texto="Actualizar" onPress={() => void cargar(dias)} disabled={cargando} />
          </View>
          <FilaPastillas isMobile={isMobile} nativeID="google-periodo">
            {PERIODOS.map(([d, t]) => (
              <Chip key={d} nativeID={`google-periodo-${d}`} label={t} activo={dias === d} onPress={() => setDias(d)} />
            ))}
          </FilaPastillas>

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
                <Cifra nativeID="google-cifra-clics" valor={numero(conectado.totales.clics)} etiqueta="Clics" icono="hand-left-outline" ancho={isMobile ? "45%" : 0} />
                <Cifra nativeID="google-cifra-veces" valor={numero(conectado.totales.impresiones)} etiqueta="Veces que sales" icono="eye-outline" ancho={isMobile ? "45%" : 0} />
                <Cifra nativeID="google-cifra-porcentaje" valor={porcentaje(conectado.totales.ctr)} etiqueta="Porcentaje de clics" icono="stats-chart-outline" ancho={isMobile ? "45%" : 0} />
                <Cifra nativeID="google-cifra-posicion" valor={posicion(conectado.totales.posicion)} etiqueta="Posición media" icono="podium-outline" ancho={isMobile ? "45%" : 0} />
              </FilaCifras>

              {/* Clics y veces que sales, por día (barras: el alto es las veces que sales; lo azul, los clics). */}
              <View style={{ flexDirection: "row" }}>
                <Bloque nativeID="google-por-dia" icono="calendar-outline" titulo="Clics por día" ancho="100%">
                  {conectado.porDia.length ? (
                    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: 110, paddingTop: 6 }}>
                      {conectado.porDia.map((d) => (
                        <View
                          key={d.fecha}
                          accessibilityLabel={`${d.fecha}: ${d.clics} clics, ${d.impresiones} veces`}
                          style={{ flex: 1, minWidth: 2, height: `${Math.max(4, (d.impresiones / maxDia) * 100)}%`, borderRadius: 3, backgroundColor: PANEL.accent2, justifyContent: "flex-end", overflow: "hidden" }}
                        >
                          <View style={{ height: `${d.impresiones ? (d.clics / d.impresiones) * 100 : 0}%`, minHeight: d.clics ? 3 : 0, backgroundColor: PANEL.accent }} />
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Detalle>Todavía no hay datos de días. Con la web recién conectada tardan unos días.</Detalle>
                  )}
                  <Text style={{ color: PANEL.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>
                    Del {fechaCorta(conectado.desde)} al {fechaCorta(conectado.hasta)} · en azul claro, las veces que sales; en azul, los clics.
                  </Text>
                </Bloque>
              </View>

              {/* Siempre en fila que baja de línea: en una columna, el ancho de cada Bloque (flexBasis) se leería como alto. */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                <Bloque nativeID="google-busquedas" icono="search-outline" titulo="Búsquedas con las que te encuentran" ancho={anchoBloque}>
                  {conectado.busquedas.length ? (
                    conectado.busquedas.map((b) => (
                      <FilaTabla
                        key={b.texto}
                        izquierda={<Text style={{ color: PANEL.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>{b.texto}</Text>}
                        derecha={`${numero(b.clics)} clics · ${numero(b.impresiones)} veces · puesto ${posicion(b.posicion)}`}
                      />
                    ))
                  ) : (
                    <Detalle>Todavía no hay búsquedas. Con la web recién conectada tardan unos días.</Detalle>
                  )}
                </Bloque>
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
                </Bloque>
                <Bloque nativeID="google-mapas" icono="map-outline" titulo="Mapas de la web" ancho={anchoBloque}>
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
              </View>

              {/* Comprobar una página: las principales y cualquier otra. */}
              <View style={{ flexDirection: "row" }}>
                <Bloque nativeID="google-comprobar" icono="checkmark-done-outline" titulo="Comprobar una página en Google" ancho="100%">
                  <Detalle>Dice si la página está en Google y, si no, por qué.</Detalle>
                  {PAGINAS_CLAVE.map(([nombre, r]) => (
                    <View key={r} style={{ gap: 2, paddingVertical: 4, borderTopWidth: 1, borderTopColor: PANEL.border }}>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10 }}>
                        <Text style={{ color: PANEL.text, fontWeight: "900", fontSize: TAMANOS.minimo, minWidth: 96 }}>{nombre}</Text>
                        <AccionTexto
                          nativeID={`google-comprobar-${r === "/" ? "portada" : r.slice(1)}`}
                          icono="search-outline"
                          texto="Comprobar en Google"
                          onPress={() => void comprobar(r)}
                          disabled={inspecciones[r] === "cargando"}
                        />
                      </View>
                      {resultadoInspeccion(r)}
                    </View>
                  ))}
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
