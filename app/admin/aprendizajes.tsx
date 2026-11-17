/**
 * Archivo: app/admin/aprendizajes.tsx
 * Función: pantalla de administración «Centro De Aprendizajes», en la dirección /admin/aprendizajes.
 * Para qué sirve: el administrador guarda, edita, activa o desactiva las lecciones y correcciones que debe aplicar Claude (textos, diseño, reglas del negocio, código), para no repetirlas.
 * Conectado con: lib/supabase.ts (tabla aprendizajes), lib/admin/products.components.ts, constants/theme.ts, components/admin/PanelUI.tsx; CLAUDE.md obliga a Claude a consultar esa tabla.
 * Utilizado por: Expo Router (dirección /admin/aprendizajes, protegida por app/admin/_layout.tsx); la enlaza la tarjeta «Centro De Aprendizajes» de app/admin/index.tsx.
 * Dependencias: react, react-native, @expo/vector-icons.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: pantalla de administración "Centro De Aprendizajes". Aquí el administrador
 * guarda cada corrección que le hace a Claude (cómo quiere los textos, el diseño, las
 * reglas del negocio, el código…), para que no tenga que repetirla.
 *
 * Cómo funciona:
 * - Lee y escribe la tabla "aprendizajes" (ver
 *   supabase/migrations/20261012150000_centro_aprendizajes.sql). Solo el administrador
 *   puede leerla o cambiarla (RLS con is_admin()).
 * - Claude consulta las lecciones activas antes de cualquier cambio que se le pida (norma
 *   en CLAUDE.md) y las aplica, empezando por las de prioridad "Imprescindible".
 * - Las lecciones no se borran: se desactivan, para conservar el historial.
 * - Un mismo formulario (ventana) sirve para crear una lección nueva («+» flotante) o editar una
 *   existente (lápiz de cada fila).
 * - Tamaños del móvil (grupo 5, 2026-11-13; constants/theme.ts): ningún texto de
 *   menos de 13 px, grises desde COLORES_TEXTO.secundario, texto azul pequeño en
 *   azulTexto, botones y chips de 44 px separados 8 y campos de 16 px y 48 de alto.
 * - Rediseño PANRED5 (tanda 5, 2026-11-16; components/admin/PanelUI.tsx, como Blog y Políticas): cifras que filtran
 *   (Total, Activas, Imprescindibles, Desactivadas), buscador de 16 px (título, regla o ejemplos), pastillas por
 *   categoría con su recuento, filas compactas (título, etiqueta de prioridad, regla, categoría y fecha) con el lápiz a
 *   mano y, al tocar una, el detalle por bloques (Regla, Ejemplos y Datos) con «Desactivar» o «Activar» abajo.
 *
 * Conectado con:
 * - app/admin/index.tsx → tarjeta "Centro De Aprendizajes" que lleva aquí.
 * - app/admin/_layout.tsx → registra esta ruta ("aprendizajes") en el Stack.
 * - CLAUDE.md → norma que obliga a Claude a consultar estas lecciones.
 * - components/admin/PanelUI.tsx → piezas comunes; pruebas/perfil-datos.mjs (TM5 y PANRED5).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { AdminHeader, AdminLoading, AdminNotice, BotonFlotante, EmptyState, IconButton, PieVentana } from "../../lib/admin/products.components";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/theme";
import {
  AccionTexto,
  Bloque,
  BotonesFila,
  Buscador,
  Chip,
  Cifra,
  Dato,
  Detalle,
  DetalleFila,
  Etiqueta,
  EtiquetaColor,
  FilaCifras,
  FilaLista,
  FilaPastillas,
  ListaVacia,
  PANEL,
  RecuentoLista,
  type Tono,
  fechaPanel,
  useDesplegables,
} from "../../components/admin/PanelUI";

// "on-drag" en web cierra el teclado con CUALQUIER desplazamiento, también el que hace el
// propio navegador al enfocar un campo (el campo se cerraba solo): solo se usa en nativo.
const CIERRE_TECLADO: "none" | "on-drag" = Platform.OS === "web" ? "none" : "on-drag";

type Categoria = "general" | "diseno" | "textos" | "negocio" | "codigo" | "seguridad" | "seo" | "panel";
type Prioridad = 1 | 2 | 3;

type Aprendizaje = {
  id: string;
  created_at: string;
  updated_at: string;
  titulo: string;
  categoria: Categoria;
  regla: string;
  ejemplo_mal: string | null;
  ejemplo_bien: string | null;
  prioridad: Prioridad;
  activa: boolean;
};

type Borrador = {
  id: string | null;
  titulo: string;
  categoria: Categoria;
  regla: string;
  ejemplo_mal: string;
  ejemplo_bien: string;
  prioridad: Prioridad;
};

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: "general", label: "General" },
  { value: "diseno", label: "Diseño" },
  { value: "textos", label: "Textos" },
  { value: "negocio", label: "Negocio" },
  { value: "codigo", label: "Código" },
  { value: "seguridad", label: "Seguridad" },
  { value: "seo", label: "SEO" },
  { value: "panel", label: "Panel" },
];

const PRIORIDADES: { value: Prioridad; label: string }[] = [
  { value: 1, label: "Imprescindible" },
  { value: 2, label: "Importante" },
  { value: 3, label: "Preferencia" },
];

const TONO_PRIORIDAD: Record<Prioridad, Tono> = { 1: "rojo", 2: "amarillo", 3: "azul" };

const BORRADOR_VACIO: Borrador = {
  id: null,
  titulo: "",
  categoria: "general",
  regla: "",
  ejemplo_mal: "",
  ejemplo_bien: "",
  prioridad: 2,
};

// Las cifras de arriba (filtran la lista).
type FiltroEstado = "todas" | "activas" | "imprescindibles" | "desactivadas";

const labelCategoria = (c: Categoria) => CATEGORIAS.find((x) => x.value === c)?.label ?? c;
const labelPrioridad = (p: Prioridad) => PRIORIDADES.find((x) => x.value === p)?.label ?? String(p);

// Error de "la tabla no existe" (la migración aún no se ha aplicado en Supabase).
function esTablaInexistente(e: any) {
  const code = String(e?.code ?? "");
  const message = String(e?.message ?? "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (/aprendizajes/.test(message) && /does not exist|not find/i.test(message))
  );
}

function cumpleEstado(a: Aprendizaje, f: FiltroEstado) {
  if (f === "activas") return a.activa;
  if (f === "imprescindibles") return a.activa && a.prioridad === 1;
  if (f === "desactivadas") return !a.activa;
  return true;
}

const inputStyle = {
  borderWidth: 1,
  borderColor: PANEL.border,
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  color: PANEL.text,
  backgroundColor: "#F8FBFE",
  // 16px: mínimo que evita el zoom automático de Safari/iOS al enfocar.
  fontSize: CAMPO.letra,
  minHeight: CAMPO.alto,
} as const;

export default function AdminAprendizajes() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const insets = useSafeAreaInsets();
  const desplegables = useDesplegables();

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [items, setItems] = useState<Aprendizaje[]>([]);

  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todas");
  const [filtroCategoria, setFiltroCategoria] = useState<Categoria | "todas">("todas");
  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);
  const [borrador, setBorrador] = useState<Borrador>(BORRADOR_VACIO);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const { data, error } = await supabase
        .from("aprendizajes")
        .select("id,created_at,updated_at,titulo,categoria,regla,ejemplo_mal,ejemplo_bien,prioridad,activa")
        .order("activa", { ascending: false })
        .order("prioridad", { ascending: true })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setItems((data ?? []) as Aprendizaje[]);
    } catch (e: any) {
      console.error("Error cargando el Centro de Aprendizajes:", e);
      setLoadErr(
        esTablaInexistente(e)
          ? "Falta crear la tabla en Supabase: aplica la migración 20261012150000_centro_aprendizajes.sql."
          : "No se han podido cargar las lecciones. Comprueba tu conexión e inténtalo de nuevo."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const q = search.trim().toLowerCase();
  const cuentaEstado = (f: FiltroEstado) => items.filter((a) => cumpleEstado(a, f)).length;
  // Las pastillas de categoría cuentan dentro de la cifra elegida.
  const delEstado = useMemo(() => items.filter((a) => cumpleEstado(a, filtroEstado)), [items, filtroEstado]);
  const cuentaCategoria = (c: Categoria | "todas") => (c === "todas" ? delEstado.length : delEstado.filter((a) => a.categoria === c).length);

  const visibles = useMemo(
    () =>
      delEstado.filter((a) => {
        if (filtroCategoria !== "todas" && a.categoria !== filtroCategoria) return false;
        if (!q) return true;
        return [a.titulo, a.regla, a.ejemplo_mal, a.ejemplo_bien].some((t) => String(t ?? "").toLowerCase().includes(q));
      }),
    [delEstado, filtroCategoria, q]
  );

  function abrirNueva() {
    setBorrador(BORRADOR_VACIO);
    setModalErr(null);
    setOpen(true);
  }

  function editar(a: Aprendizaje) {
    setBorrador({
      id: a.id,
      titulo: a.titulo,
      categoria: a.categoria,
      regla: a.regla,
      ejemplo_mal: a.ejemplo_mal ?? "",
      ejemplo_bien: a.ejemplo_bien ?? "",
      prioridad: a.prioridad,
    });
    setModalErr(null);
    setMsg(null);
    setOpen(true);
  }

  async function guardar() {
    const titulo = borrador.titulo.trim();
    const regla = borrador.regla.trim();
    if (titulo.length < 3 || regla.length < 3) {
      setModalErr("Escribe al menos un título y la regla a seguir.");
      return;
    }
    setSaving(true);
    setModalErr(null);
    setMsg(null);
    try {
      const fila = {
        titulo,
        categoria: borrador.categoria,
        regla,
        ejemplo_mal: borrador.ejemplo_mal.trim() || null,
        ejemplo_bien: borrador.ejemplo_bien.trim() || null,
        prioridad: borrador.prioridad,
      };
      const { error } = borrador.id
        ? await supabase.from("aprendizajes").update(fila).eq("id", borrador.id)
        : await supabase.from("aprendizajes").insert({ ...fila, activa: true });
      if (error) throw error;
      setMsg({ type: "ok", text: borrador.id ? "Lección actualizada." : "Lección guardada. Claude la aplicará desde ahora." });
      setBorrador(BORRADOR_VACIO);
      setOpen(false);
      await load();
    } catch (e: any) {
      console.error("Error guardando la lección:", e);
      setModalErr("No se ha podido guardar. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  async function cambiarActiva(a: Aprendizaje, activa: boolean) {
    setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, activa } : x)));
    const { error } = await supabase.from("aprendizajes").update({ activa }).eq("id", a.id);
    if (error) {
      console.error("Error cambiando el estado de la lección:", error);
      setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, activa: !activa } : x)));
      setMsg({ type: "error", text: "No se ha podido cambiar el estado. Inténtalo de nuevo." });
    }
  }

  const hayFiltro = filtroEstado !== "todas" || filtroCategoria !== "todas" || !!q;

  return (
    <View style={{ flex: 1, backgroundColor: PANEL.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado), igual en todo el panel. */}
      <AdminHeader title="Centro De Aprendizajes" isMobile={isMobile} />

      {loading ? (
        <AdminLoading texto="Cargando lecciones…" />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 48 + 74 + insets.bottom, alignItems: "center" }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={CIERRE_TECLADO}
        >
          <View style={{ width: "100%", maxWidth: 1040, gap: isMobile ? 18 : 22 }}>
            {/* 1) Cifras que filtran la lista (otro toque en la misma, todas). */}
            <FilaCifras nativeID="aprendizajes-cifras">
              {(
                [
                  ["todas", "Total", "school-outline"],
                  ["activas", "Activas", "checkmark-circle-outline"],
                  ["imprescindibles", "Imprescindibles", "alert-circle-outline"],
                  ["desactivadas", "Desactivadas", "pause-circle-outline"],
                ] as const
              ).map(([f, etiqueta, icono]) => (
                <Cifra
                  key={f}
                  nativeID={`aprendizajes-cifra-${f}`}
                  valor={String(cuentaEstado(f))}
                  etiqueta={etiqueta}
                  icono={icono}
                  ancho={isMobile ? "45%" : 0}
                  activa={filtroEstado === f && f !== "todas"}
                  onPress={() => setFiltroEstado((x) => (x === f ? "todas" : f))}
                />
              ))}
            </FilaCifras>

            <Detalle>Lo que le corriges a Claude. Lo consulta antes de cada cambio que le pidas, empezando por las imprescindibles.</Detalle>

            {/* 2) Buscador y pastillas por categoría con su recuento. */}
            <View style={{ gap: 12 }}>
              <Buscador
                nativeID="aprendizajes-buscar"
                valor={search}
                onCambiar={setSearch}
                placeholder="Buscar por título, regla o ejemplo"
                etiqueta="Buscar lecciones por título, regla o ejemplo"
              />
              <FilaPastillas isMobile={isMobile} nativeID="aprendizajes-filtros">
                <Chip nativeID="aprendizajes-filtro-todas" label={`Todas (${cuentaCategoria("todas")})`} activo={filtroCategoria === "todas"} onPress={() => setFiltroCategoria("todas")} />
                {CATEGORIAS.map((c) => (
                  <Chip
                    key={c.value}
                    nativeID={`aprendizajes-filtro-${c.value}`}
                    label={`${c.label} (${cuentaCategoria(c.value)})`}
                    activo={filtroCategoria === c.value}
                    onPress={() => setFiltroCategoria(c.value)}
                  />
                ))}
              </FilaPastillas>
            </View>

            {!!msg && <AdminNotice tone={msg.type === "ok" ? "success" : "danger"} text={msg.text} />}

            {loadErr ? (
              <View style={{ gap: 4, alignItems: "center" }}>
                <AdminNotice tone="danger" text={loadErr} />
                <AccionTexto nativeID="aprendizajes-reintentar" icono="refresh-outline" texto="Reintentar" onPress={load} />
              </View>
            ) : (
              /* 3) Cuántas salen, «Abrir todas» y las filas compactas. */
              <View style={{ gap: 4 }}>
                <RecuentoLista
                  nativeID="aprendizajes-recuento"
                  texto={q ? `${visibles.length} ${visibles.length === 1 ? "lección encontrada" : "lecciones encontradas"}` : `${visibles.length} de ${items.length} lecciones`}
                  abiertas={desplegables.todasAbiertas(visibles.map((a) => a.id))}
                  onAlternar={visibles.length ? () => desplegables.abrirOCerrarTodas(visibles.map((a) => a.id)) : undefined}
                  idBoton="aprendizajes-abrir-todas"
                  femenino
                />
                {visibles.length === 0 ? (
                  items.length && hayFiltro ? (
                    <ListaVacia nativeID="aprendizajes-vacio" icono="school-outline" titulo="No hay lecciones para este filtro." texto="Prueba a borrar el buscador o a elegir «Todas»." />
                  ) : (
                    <EmptyState icon="school-outline" title="Aún no hay lecciones." text="Cada vez que corrijas algo a Claude, guárdalo con el «+» para que no vuelva a pasar." />
                  )
                ) : (
                  <View nativeID="aprendizajes-lista">
                    {visibles.map((a, n) => {
                      const abierta = desplegables.estaAbierta(a.id);
                      return (
                        <FilaLista
                          key={a.id}
                          nativeID={`leccion-${a.id}`}
                          idFila={`leccion-fila-${a.id}`}
                          primera={n === 0}
                          abierta={abierta}
                          onPress={() => desplegables.alternar(a.id)}
                          etiquetaAccesible={`${a.titulo}, ${labelPrioridad(a.prioridad)}${a.activa ? "" : ", desactivada"}. ${abierta ? "Plegar" : "Ver el detalle"}`}
                          titulo={a.titulo}
                          colorTitulo={a.activa ? undefined : PANEL.muted}
                          etiqueta={
                            <>
                              <EtiquetaColor nativeID={`leccion-prioridad-${a.id}`} texto={labelPrioridad(a.prioridad)} tono={a.activa ? TONO_PRIORIDAD[a.prioridad] : "gris"} />
                              {a.activa ? null : <EtiquetaColor nativeID={`leccion-estado-${a.id}`} texto="Desactivada" tono="gris" />}
                            </>
                          }
                          subtitulo={a.regla}
                          idSubtitulo={`leccion-regla-${a.id}`}
                          lineasSubtitulo={2}
                          etiquetas={
                            <>
                              <Etiqueta icon="pricetag-outline" color={COLORES_TEXTO.azulTexto} texto={labelCategoria(a.categoria)} />
                              <Etiqueta icon="time-outline" color={PANEL.muted} texto={`Actualizada: ${fechaPanel(a.updated_at)}`} />
                            </>
                          }
                          derecha={
                            <BotonesFila>
                              <IconButton icon="create-outline" label={`Editar la lección ${a.titulo}`} variant="primary" onPress={() => editar(a)} />
                            </BotonesFila>
                          }
                        >
                          <DetalleFila
                            nativeID={`leccion-detalle-${a.id}`}
                            idAcciones={`leccion-acciones-${a.id}`}
                            acciones={
                              <>
                                <AccionTexto
                                  nativeID={`leccion-activar-${a.id}`}
                                  icono={a.activa ? "pause-circle-outline" : "checkmark-circle-outline"}
                                  texto={a.activa ? "Desactivar la lección" : "Activar la lección"}
                                  onPress={() => cambiarActiva(a, !a.activa)}
                                />
                                <AccionTexto nativeID={`leccion-editar-${a.id}`} icono="create-outline" texto="Editar la lección" onPress={() => editar(a)} />
                              </>
                            }
                          >
                            <Bloque icono="document-text-outline" titulo="Regla" ancho={isMobile ? "100%" : "45%"}>
                              <Text style={{ color: PANEL.text, fontSize: TAMANOS.minimo, lineHeight: 19 }}>{a.regla}</Text>
                            </Bloque>
                            <Bloque icono="swap-horizontal-outline" titulo="Ejemplos" ancho={isMobile ? "100%" : "45%"}>
                              {a.ejemplo_mal || a.ejemplo_bien ? (
                                <>
                                  {a.ejemplo_mal ? <Dato etiqueta="Mal">{a.ejemplo_mal}</Dato> : null}
                                  {a.ejemplo_bien ? <Dato etiqueta="Bien">{a.ejemplo_bien}</Dato> : null}
                                </>
                              ) : (
                                <Detalle>Sin ejemplos.</Detalle>
                              )}
                            </Bloque>
                            <Bloque icono="information-circle-outline" titulo="Datos" ancho="100%">
                              <Dato etiqueta="Categoría">{labelCategoria(a.categoria)}</Dato>
                              <Dato etiqueta="Prioridad">{labelPrioridad(a.prioridad)}</Dato>
                              <Dato etiqueta="Estado">{a.activa ? "Activa: Claude la aplica" : "Desactivada: se guarda en el historial"}</Dato>
                              <Dato etiqueta="Creada">{fechaPanel(a.created_at, true)}</Dato>
                              <Dato etiqueta="Actualizada">{fechaPanel(a.updated_at, true)}</Dato>
                            </Bloque>
                          </DetalleFila>
                        </FilaLista>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* «Nueva lección»: el «+» flotante abajo a la derecha (al alcance del pulgar). */}
      {!loading && !loadErr ? <BotonFlotante nativeID="aprendizajes-nueva" label="Nueva lección" onPress={abrirNueva} /> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.60)" }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              paddingHorizontal: isMobile ? 10 : 16,
              paddingTop: (isMobile ? 16 : 24) + insets.top,
              paddingBottom: (isMobile ? 24 : 32) + insets.bottom,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={CIERRE_TECLADO}
          >
            <View style={{ width: "100%", maxWidth: 640, alignSelf: "center", borderRadius: 20, borderWidth: 1, borderColor: PANEL.border, backgroundColor: PANEL.bg, padding: isMobile ? 14 : 16, gap: 12 }}>
              <Text style={{ color: PANEL.text, fontSize: isMobile ? 19 : 20, fontWeight: "900", textAlign: "center" }}>{borrador.id ? "Editar lección" : "Nueva lección"}</Text>

              <TextInput
                value={borrador.titulo}
                onChangeText={(titulo) => setBorrador((b) => ({ ...b, titulo }))}
                placeholder="Título corto (p. ej. «Nunca pongas textos en inglés»)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                accessibilityLabel="Título de la lección"
                maxLength={140}
                style={inputStyle}
              />

              <Text style={{ color: PANEL.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>Categoría</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
                {CATEGORIAS.map((c) => (
                  <Chip key={c.value} label={c.label} activo={borrador.categoria === c.value} onPress={() => setBorrador((b) => ({ ...b, categoria: c.value }))} />
                ))}
              </View>

              <Text style={{ color: PANEL.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>Prioridad</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
                {PRIORIDADES.map((p) => (
                  <Chip key={p.value} label={p.label} activo={borrador.prioridad === p.value} onPress={() => setBorrador((b) => ({ ...b, prioridad: p.value }))} />
                ))}
              </View>

              <TextInput
                value={borrador.regla}
                onChangeText={(regla) => setBorrador((b) => ({ ...b, regla }))}
                placeholder="La regla: qué debe hacer (o no hacer) Claude a partir de ahora"
                placeholderTextColor="rgba(11,33,56,0.40)"
                accessibilityLabel="Regla de la lección"
                multiline
                maxLength={4000}
                style={[inputStyle, { minHeight: 90, textAlignVertical: "top" }]}
              />
              <TextInput
                value={borrador.ejemplo_mal}
                onChangeText={(ejemplo_mal) => setBorrador((b) => ({ ...b, ejemplo_mal }))}
                placeholder="Opcional: cómo estaba mal"
                placeholderTextColor="rgba(11,33,56,0.40)"
                multiline
                maxLength={2000}
                style={[inputStyle, { minHeight: 56, textAlignVertical: "top" }]}
              />
              <TextInput
                value={borrador.ejemplo_bien}
                onChangeText={(ejemplo_bien) => setBorrador((b) => ({ ...b, ejemplo_bien }))}
                placeholder="Opcional: cómo debe quedar"
                placeholderTextColor="rgba(11,33,56,0.40)"
                multiline
                maxLength={2000}
                style={[inputStyle, { minHeight: 56, textAlignVertical: "top" }]}
              />

              {!!modalErr && <AdminNotice tone="danger" text={modalErr} />}

              {/* «Guardar» y, a su derecha, la X para cerrar (dueño, 2026-11-04). */}
              <PieVentana onCerrar={() => setOpen(false)}>
                <Pressable
                  onPress={guardar}
                  disabled={saving}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    flex: 1,
                    opacity: pressed || saving ? 0.75 : 1,
                    minHeight: CAMPO.alto,
                    borderRadius: 999,
                    backgroundColor: PANEL.accent,
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 8,
                  })}
                >
                  {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                  <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>{saving ? "Guardando…" : borrador.id ? "Guardar cambios" : "Guardar lección"}</Text>
                </Pressable>
              </PieVentana>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
