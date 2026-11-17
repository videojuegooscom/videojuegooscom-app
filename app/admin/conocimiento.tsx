/**
 * Archivo: app/admin/conocimiento.tsx
 * Función: pantalla de administración «Lo que Blue sabe de la tienda», en la dirección /admin/conocimiento.
 * Para qué sirve: el dueño escribe respuestas reales (horario, envíos, garantía, pagos…) que Blue IA usa al contestar a los clientes; también contesta a los temas que Blue le propone.
 * Conectado con: lib/supabase.ts (tabla blue_conocimiento), lib/conocimiento.ts, lib/admin/productos.componentes.tsx, constants/theme.ts, components/admin/PiezasPanelAdmin.tsx; components/AsistenteBlue.tsx propone temas y api/blue-ia.ts las usa.
 * Utilizado por: Expo Router (dirección /admin/conocimiento, protegida por app/admin/_layout.tsx); la enlaza la tarjeta correspondiente de app/admin/index.tsx.
 * Dependencias: react, react-native.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: pantalla de administración de «Lo que Blue sabe de la tienda». Aquí el dueño
 * escribe respuestas reales (horario, plazos de envío, garantía, pagos…) y Blue IA las usa al
 * contestar a los clientes con más precisión. Blue, desde el panel, le propone temas a lo largo
 * del día (components/AsistenteBlue.tsx) y también se pueden añadir desde aquí.
 *
 * Cómo funciona:
 * - Lee/escribe la tabla «blue_conocimiento» (tema único, respuesta de hasta 800 caracteres,
 *   activo sí/no). RLS: lectura de las activas para todos, escritura solo admin (is_admin()).
 * - «Blue te propone»: los temas de lib/conocimiento.ts que aún no tienen respuesta; al tocar
 *   uno se abre el formulario con la pregunta de Blue. La respuesta la escribe siempre el dueño:
 *   la app nunca inventa datos del negocio.
 * - Activar/desactivar y borrar: igual que Noticias Flash (cambio optimista, borrado con aviso).
 * - Tamaños del móvil (grupo 5, 2026-11-13; constants/theme.ts): ningún texto de menos de 13 px,
 *   grises desde COLORES_TEXTO.secundario, texto azul pequeño en azulTexto, todo lo que se toca de
 *   44 px y los campos de 16 px y 48 de alto.
 * - Rediseño PANRED5 (tanda 5, 2026-11-16; components/admin/PiezasPanelAdmin.tsx, como Blog y Noticias Flash): cifras que
 *   filtran (Temas, Blue lo usa, Ocultos) y las propuestas de Blue, buscador de 16 px (tema o respuesta), pastillas con
 *   su recuento, «Blue te propone» en pastillas, filas compactas (tema, etiqueta de color, respuesta y fecha) con el
 *   lápiz y la papelera a mano y, al tocar una, el detalle por bloques (Respuesta y Uso) con «Ocultar a Blue» o «Que Blue
 *   lo use» abajo. «Añadir información» es el «+» flotante.
 *
 * Conectado con:
 * - lib/conocimiento.ts → temas propuestos y guardado.
 * - api/blue-ia.ts → lee los temas activos para responder a los clientes.
 * - app/admin/index.tsx → tarjeta de entrada; app/admin/_layout.tsx → registra la ruta.
 * - components/admin/PiezasPanelAdmin.tsx → piezas comunes; pruebas/perfil-datos.mjs (NO7, TM5 y PANRED5).
 */
import React, { useEffect, useMemo, useState } from "react";
import {
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
import { AdminHeader, AdminLoading, AdminNotice, BotonFlotante, EmptyState, IconButton, PieVentana } from "../../lib/admin/productos.componentes";
import { guardarConocimiento, TEMAS_CONOCIMIENTO, type ItemConocimiento } from "../../lib/conocimiento";
import { CAMPO, COLORES_TEXTO, TAMANOS } from "../../constants/theme";
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
  Seccion,
  fechaPanel,
  useDesplegables,
} from "../../components/admin/PiezasPanelAdmin";

type Filtro = "todos" | "activos" | "ocultos";
const PASTILLAS: [Filtro, string][] = [
  ["todos", "Todos"],
  ["activos", "Blue lo usa"],
  ["ocultos", "Ocultos"],
];
const cumple = (i: ItemConocimiento, f: Filtro) => (f === "activos" ? i.activo : f === "ocultos" ? !i.activo : true);

export default function AdminConocimiento() {
  const { width } = useWindowDimensions();
  const isMobile = (width && width > 0 ? width : 1024) < 700;
  const insets = useSafeAreaInsets();
  const desplegables = useDesplegables();

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);
  const [items, setItems] = useState<ItemConocimiento[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [pregunta, setPregunta] = useState<string | null>(null);
  const [tema, setTema] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [editando, setEditando] = useState(false);
  const [borrar, setBorrar] = useState<ItemConocimiento | null>(null);

  // Temas que Blue propone y aún no tienen respuesta.
  const pendientes = useMemo(() => {
    const hechos = new Set(items.map((i) => i.tema));
    return TEMAS_CONOCIMIENTO.filter((t) => !hechos.has(t.tema));
  }, [items]);

  const q = search.trim().toLowerCase();
  const cuenta = (f: Filtro) => items.filter((i) => cumple(i, f)).length;
  const visibles = useMemo(
    () => items.filter((i) => cumple(i, filtro) && (!q || i.tema.toLowerCase().includes(q) || String(i.respuesta ?? "").toLowerCase().includes(q))),
    [items, filtro, q]
  );

  async function load() {
    setLoading(true);
    setScreenErr(null);
    try {
      const { data, error } = await supabase
        .from("blue_conocimiento")
        .select("id,tema,respuesta,activo,created_at,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setItems((data ?? []) as ItemConocimiento[]);
    } catch (e) {
      console.error("Error cargando lo que Blue sabe:", e);
      setScreenErr("No se ha podido cargar la información. Inténtalo de nuevo.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function abrir(t: string, r: string, p: string | null, edit: boolean) {
    setTema(t);
    setRespuesta(r);
    setPregunta(p);
    setEditando(edit);
    setModalErr(null);
    setOpen(true);
  }

  async function guardar() {
    if (saving) return;
    setSaving(true);
    setModalErr(null);
    const error = await guardarConocimiento(tema, respuesta);
    setSaving(false);
    if (error) {
      setModalErr(error);
      return;
    }
    setOpen(false);
    await load();
  }

  async function alternar(row: ItemConocimiento) {
    const antes = items;
    setItems(items.map((x) => (x.id === row.id ? { ...x, activo: !x.activo } : x)));
    const { error } = await supabase.from("blue_conocimiento").update({ activo: !row.activo, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) {
      setItems(antes);
      setScreenErr("No se ha podido cambiar. Inténtalo de nuevo.");
    }
  }

  async function borrarConfirmado() {
    const row = borrar;
    if (!row) return;
    setBorrar(null);
    const { error } = await supabase.from("blue_conocimiento").delete().eq("id", row.id);
    if (error) setScreenErr("No se ha podido borrar. Inténtalo de nuevo.");
    await load();
  }

  const boton = (texto: string, onPress: () => void, principal = false) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        borderRadius: 999,
        minHeight: CAMPO.alto,
        justifyContent: "center",
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: principal ? PANEL.accent : PANEL.border,
        backgroundColor: principal ? PANEL.accent : PANEL.card,
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <Text style={{ color: principal ? "#FFFFFF" : PANEL.text, fontWeight: "900", fontSize: 13.5, textAlign: "center" }}>{texto}</Text>
    </Pressable>
  );

  const hayFiltro = filtro !== "todos" || !!q;

  return (
    <View style={{ flex: 1, backgroundColor: PANEL.bg }}>
      <StatusBar barStyle="dark-content" />

      <AdminHeader title="Lo que Blue sabe" isMobile={isMobile} />

      {loading ? (
        <AdminLoading texto="Cargando…" />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 48 + 74 + insets.bottom, alignItems: "center" }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ width: "100%", maxWidth: 1040, gap: isMobile ? 18 : 22 }}>
            {/* 1) Cifras: las tres primeras filtran la lista (otro toque en la misma, todos). */}
            <FilaCifras nativeID="conocimiento-cifras">
              {(
                [
                  ["todos", "Temas", "bulb-outline"],
                  ["activos", "Blue lo usa", "checkmark-circle-outline"],
                  ["ocultos", "Ocultos", "eye-off-outline"],
                ] as const
              ).map(([f, etiqueta, icono]) => (
                <Cifra
                  key={f}
                  nativeID={`conocimiento-cifra-${f}`}
                  valor={String(cuenta(f))}
                  etiqueta={etiqueta}
                  icono={icono}
                  ancho={isMobile ? "45%" : 0}
                  activa={filtro === f && f !== "todos"}
                  onPress={() => setFiltro((x) => (x === f ? "todos" : f))}
                />
              ))}
              <Cifra nativeID="conocimiento-cifra-propuestas" valor={String(pendientes.length)} etiqueta="Propuestas de Blue" icono="sparkles-outline" ancho={isMobile ? "45%" : 0} />
            </FilaCifras>

            <Detalle>Respuestas reales de la tienda. Blue IA las usa para contestar a tus clientes con precisión, sin inventar nada.</Detalle>

            {!!screenErr && <AdminNotice tone="danger" text={screenErr} />}

            {/* 2) Lo que Blue propone: al tocar un tema, se abre el formulario con su pregunta. */}
            {pendientes.length ? (
              <Seccion nativeID="conocimiento-propuestas" icon="sparkles-outline" title="Blue te propone" extra={`${pendientes.length} ${pendientes.length === 1 ? "tema" : "temas"}`}>
                <FilaPastillas isMobile={isMobile}>
                  {pendientes.map((t) => (
                    <Chip key={t.tema} label={t.tema} onPress={() => abrir(t.tema, "", t.pregunta, false)} />
                  ))}
                </FilaPastillas>
              </Seccion>
            ) : null}

            {/* 3) Buscador y pastillas con su recuento. */}
            <View style={{ gap: 12 }}>
              <Buscador
                nativeID="conocimiento-buscar"
                valor={search}
                onCambiar={setSearch}
                placeholder="Buscar por tema o respuesta"
                etiqueta="Buscar en lo que Blue sabe por tema o respuesta"
              />
              <FilaPastillas isMobile={isMobile} nativeID="conocimiento-filtros">
                {PASTILLAS.map(([f, t]) => (
                  <Chip key={f} nativeID={`conocimiento-filtro-${f}`} label={`${t} (${cuenta(f)})`} activo={filtro === f} onPress={() => setFiltro(f)} />
                ))}
              </FilaPastillas>
            </View>

            {/* 4) Cuántos salen, «Abrir todos» y las filas compactas. */}
            <View style={{ gap: 4 }}>
              <RecuentoLista
                nativeID="conocimiento-recuento"
                texto={q ? `${visibles.length} ${visibles.length === 1 ? "tema encontrado" : "temas encontrados"}` : `${visibles.length} de ${items.length} temas`}
                abiertas={desplegables.todasAbiertas(visibles.map((r) => r.id))}
                onAlternar={visibles.length ? () => desplegables.abrirOCerrarTodas(visibles.map((r) => r.id)) : undefined}
                idBoton="conocimiento-abrir-todos"
              />
              {visibles.length === 0 ? (
                items.length && hayFiltro ? (
                  <ListaVacia nativeID="conocimiento-vacio" icono="bulb-outline" titulo="No hay temas para este filtro." texto="Prueba a borrar el buscador o a elegir «Todos»." />
                ) : (
                  <EmptyState icon="bulb-outline" title="Todavía no hay información." text="Toca uno de los temas de Blue o añade lo tuyo con el «+»." />
                )
              ) : (
                <View nativeID="conocimiento-lista">
                  {visibles.map((row, n) => {
                    const abierta = desplegables.estaAbierta(row.id);
                    return (
                      <FilaLista
                        key={row.id}
                        nativeID={`conocimiento-${row.id}`}
                        idFila={`conocimiento-fila-${row.id}`}
                        primera={n === 0}
                        abierta={abierta}
                        onPress={() => desplegables.alternar(row.id)}
                        etiquetaAccesible={`${row.tema}, ${row.activo ? "Blue lo usa" : "oculto"}. ${abierta ? "Plegar" : "Ver el detalle"}`}
                        titulo={row.tema}
                        etiqueta={<EtiquetaColor nativeID={`conocimiento-estado-${row.id}`} texto={row.activo ? "Blue lo usa" : "Oculto"} tono={row.activo ? "verde" : "gris"} />}
                        subtitulo={row.respuesta}
                        idSubtitulo={`conocimiento-respuesta-${row.id}`}
                        lineasSubtitulo={2}
                        etiquetas={
                          <>
                            <Etiqueta icon="time-outline" color={PANEL.muted} texto={`Actualizado: ${fechaPanel(row.updated_at)}`} />
                            <Etiqueta icon="text-outline" color={COLORES_TEXTO.azulTexto} texto={`${String(row.respuesta ?? "").length} / 800`} />
                          </>
                        }
                        derecha={
                          <BotonesFila>
                            {/* Acciones con iconos (su nombre, para el lector de pantalla y al pasar el ratón). */}
                            <IconButton icon="create-outline" label={`Editar «${row.tema}»`} variant="primary" onPress={() => abrir(row.tema, row.respuesta, null, true)} />
                            <IconButton icon="trash-outline" label={`Borrar «${row.tema}»`} variant="danger" onPress={() => setBorrar(row)} />
                          </BotonesFila>
                        }
                      >
                        <DetalleFila
                          nativeID={`conocimiento-detalle-${row.id}`}
                          idAcciones={`conocimiento-acciones-${row.id}`}
                          acciones={
                            <>
                              <AccionTexto
                                nativeID={`conocimiento-alternar-${row.id}`}
                                icono={row.activo ? "eye-off-outline" : "checkmark-circle-outline"}
                                texto={row.activo ? "Ocultar a Blue" : "Que Blue lo use"}
                                onPress={() => alternar(row)}
                              />
                              <AccionTexto nativeID={`conocimiento-editar-${row.id}`} icono="create-outline" texto="Editar la respuesta" onPress={() => abrir(row.tema, row.respuesta, null, true)} />
                            </>
                          }
                        >
                          <Bloque icono="chatbox-ellipses-outline" titulo="Respuesta" ancho={isMobile ? "100%" : "55%"}>
                            <Text style={{ color: PANEL.text, fontSize: TAMANOS.minimo, lineHeight: 19 }}>{row.respuesta}</Text>
                          </Bloque>
                          <Bloque icono="pulse-outline" titulo="Uso" ancho={isMobile ? "100%" : "35%"}>
                            <View style={{ flexDirection: "row" }}>
                              <EtiquetaColor texto={row.activo ? "Blue lo usa" : "Oculto"} tono={row.activo ? "verde" : "gris"} />
                            </View>
                            <Detalle>{row.activo ? "Blue IA lo tiene en cuenta al contestar a los clientes." : "Guardado, pero Blue IA no lo usa."}</Detalle>
                            <Dato etiqueta="Creado">{fechaPanel(row.created_at, true)}</Dato>
                            <Dato etiqueta="Actualizado">{fechaPanel(row.updated_at, true)}</Dato>
                          </Bloque>
                        </DetalleFila>
                      </FilaLista>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      )}

      {/* «Añadir información»: el «+» flotante abajo a la derecha (al alcance del pulgar). */}
      {!loading ? <BotonFlotante nativeID="conocimiento-nuevo" label="Añadir información" onPress={() => abrir("", "", null, false)} /> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable
            onPress={() => setOpen(false)}
            style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.45)", alignItems: "center", justifyContent: "center", padding: 16 }}
          >
            <Pressable
              onPress={() => undefined}
              style={{ width: "100%", maxWidth: 480, backgroundColor: PANEL.bg, borderRadius: 24, padding: 18, gap: 12 }}
            >
              <Text style={{ color: PANEL.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>
                {editando ? "Editar información" : "Añadir información"}
              </Text>
              {pregunta ? (
                <Text style={{ color: PANEL.accentDark, fontWeight: "900", lineHeight: 21, textAlign: "center" }}>Blue pregunta: {pregunta}</Text>
              ) : null}
              <TextInput
                value={tema}
                onChangeText={setTema}
                editable={!editando && !pregunta}
                placeholder="Tema (ej.: Horario de atención)"
                maxLength={80}
                style={{ borderWidth: 1, borderColor: PANEL.border, borderRadius: 14, padding: 12, color: PANEL.text, backgroundColor: PANEL.card, fontSize: CAMPO.letra, minHeight: CAMPO.alto }}
              />
              <TextInput
                value={respuesta}
                onChangeText={setRespuesta}
                placeholder="Escribe la respuesta real"
                multiline
                maxLength={800}
                style={{ borderWidth: 1, borderColor: PANEL.border, borderRadius: 14, padding: 12, minHeight: 110, color: PANEL.text, backgroundColor: PANEL.card, fontSize: CAMPO.letra, textAlignVertical: "top" }}
              />
              <Text style={{ color: PANEL.muted, fontSize: TAMANOS.minimo, textAlign: "right" }}>{respuesta.length} / 800</Text>
              {!!modalErr && <Text style={{ color: PANEL.danger, fontWeight: "800", textAlign: "center" }}>{modalErr}</Text>}
              {/* «Guardar» y, a su derecha, la X para cerrar (dueño, 2026-11-04). */}
              <PieVentana onCerrar={() => setOpen(false)}>
                <View style={{ flex: 1 }}>{boton(saving ? "Guardando…" : "Guardar", guardar, true)}</View>
              </PieVentana>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!borrar} transparent animationType="fade" onRequestClose={() => setBorrar(null)}>
        <Pressable
          onPress={() => setBorrar(null)}
          style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.45)", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <Pressable onPress={() => undefined} style={{ width: "100%", maxWidth: 420, backgroundColor: PANEL.bg, borderRadius: 24, padding: 18, gap: 12 }}>
            <Text style={{ color: PANEL.text, fontWeight: "900", fontSize: 17, textAlign: "center" }}>¿Borrar «{borrar?.tema}»?</Text>
            <Text style={{ color: PANEL.muted, textAlign: "center", lineHeight: 20 }}>Blue dejará de usar esta información.</Text>
            <PieVentana onCerrar={() => setBorrar(null)}>
              <View style={{ flex: 1 }}>{boton("Borrar", borrarConfirmado, true)}</View>
            </PieVentana>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
