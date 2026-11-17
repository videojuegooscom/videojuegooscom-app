/**
 * Archivo: app/admin/auditorias.tsx
 * Función: pantalla de administración «Revisiones», en la dirección /admin/auditorias.
 * Para qué sirve: el administrador consulta el registro de las revisiones de calidad web automáticas (20 puntos) con su resultado y el detalle punto por punto.
 * Conectado con: lib/supabase.ts (tabla auditorias_web, que escribe api/auditoria-web.ts por cron), lib/admin/productos.componentes.tsx, constants/temaTienda.ts, components/admin/PiezasPanelAdmin.tsx.
 * Utilizado por: Expo Router (dirección /admin/auditorias, protegida por app/admin/_layout.tsx); la enlaza la tarjeta correspondiente de app/admin/index.tsx.
 * Dependencias: react, react-native.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: pantalla de administración «Revisiones»: el registro de las revisiones de calidad web
 * automáticas de la tienda (la lista de 20 puntos). Cada fila dice cuándo se hizo, cuántos puntos
 * salieron bien, con aviso o con fallo, qué se cambió (nada: la revisión automática solo lee) y,
 * al tocarla, el detalle punto por punto.
 *
 * Cómo funciona:
 * - Lee la tabla «auditorias_web» (RLS: solo el administrador). La escribe api/auditoria-web.ts,
 *   que lanza el cron de Vercel los días 1 y 15 de cada mes (≈ cada dos semanas).
 * - Los puntos «manual» necesitan un navegador o leer el código: los repasa Claude en sus
 *   sesiones cuando han pasado más de 14 días desde la última revisión.
 *
 * - Tamaños del móvil (grupo 5, 2026-11-13; constants/temaTienda.ts): ningún texto de menos de 13 px, grises
 *   desde COLORES_TEXTO.secundario y «volver» de 44 px.
 * - Rediseño PANRED5 (tanda 5, 2026-11-16; components/admin/PiezasPanelAdmin.tsx): cifras que filtran (Revisiones, Con fallos,
 *   Con avisos, Todo bien), buscador de 16 px (resumen, cambios o puntos), pastillas con su recuento, filas compactas
 *   (fecha, etiqueta de color, resumen y recuentos) y, al tocar una, el detalle por bloques (Resumen y Puntos revisados).
 *   La más reciente sale ya abierta.
 *
 * Conectado con: api/auditoria-web.ts, app/admin/index.tsx (tarjeta), app/admin/_layout.tsx,
 * components/admin/PiezasPanelAdmin.tsx y pruebas/perfil-datos.mjs (TM5 y PANRED5).
 */
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StatusBar, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { AdminHeader, AdminLoading, AdminNotice, EmptyState } from "../../lib/admin/productos.componentes";
import { TAMANOS } from "../../constants/temaTienda";
import {
  Bloque,
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
  type IoniconName,
  type Tono,
  fechaPanel,
  useDesplegables,
} from "../../components/admin/PiezasPanelAdmin";

type Punto = { n: number; nombre: string; estado: "ok" | "aviso" | "fallo" | "manual"; detalle: string };
type Fila = {
  id: string;
  ejecutada_en: string;
  origen: string;
  resumen: string;
  ok: number;
  avisos: number;
  fallos: number;
  manuales: number;
  duracion_ms: number;
  cambios: string;
  resultado: Punto[];
};

const SIMBOLO: Record<Punto["estado"], { icono: IoniconName; color: string; texto: string }> = {
  ok: { icono: "checkmark-circle", color: PANEL.success, texto: "Bien" },
  aviso: { icono: "alert-circle", color: PANEL.warning, texto: "Aviso" },
  fallo: { icono: "close-circle", color: PANEL.danger, texto: "Fallo" },
  manual: { icono: "hand-left-outline", color: PANEL.muted, texto: "Lo revisa Claude" },
};

type Filtro = "todas" | "fallos" | "avisos" | "bien";
const PASTILLAS: [Filtro, string][] = [
  ["todas", "Todas"],
  ["fallos", "Con fallos"],
  ["avisos", "Con avisos"],
  ["bien", "Todo bien"],
];
// Cada revisión cae en una sola: con algún fallo, con avisos (sin fallos) o todo bien.
const tipo = (f: Fila): Exclude<Filtro, "todas"> => (f.fallos > 0 ? "fallos" : f.avisos > 0 ? "avisos" : "bien");
const ETIQUETA: Record<Exclude<Filtro, "todas">, { texto: string; tono: Tono }> = {
  fallos: { texto: "Con fallos", tono: "rojo" },
  avisos: { texto: "Con avisos", tono: "amarillo" },
  bien: { texto: "Todo bien", tono: "verde" },
};
const segundos = (ms: number) => `${(Math.round((Number(ms) || 0) / 100) / 10).toFixed(1).replace(".", ",")} s`;

export default function AdminAuditorias() {
  const { width } = useWindowDimensions();
  const isMobile = (width && width > 0 ? width : 1024) < 700;
  const insets = useSafeAreaInsets();
  const desplegables = useDesplegables();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [search, setSearch] = useState("");
  const { abrir } = desplegables;

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("auditorias_web")
          .select("id,ejecutada_en,origen,resumen,ok,avisos,fallos,manuales,duracion_ms,cambios,resultado")
          .order("ejecutada_en", { ascending: false })
          .limit(24);
        if (error) throw error;
        const lista = (data ?? []) as Fila[];
        setFilas(lista);
        // La más reciente, ya abierta.
        if (lista[0]) abrir(lista[0].id);
      } catch (e) {
        console.error("Error cargando las revisiones:", e);
        setErr("No se han podido cargar las revisiones. Inténtalo de nuevo.");
      } finally {
        setLoading(false);
      }
    })();
  }, [abrir]);

  const q = search.trim().toLowerCase();
  const cuenta = (f: Filtro) => (f === "todas" ? filas.length : filas.filter((x) => tipo(x) === f).length);
  const visibles = useMemo(
    () =>
      filas.filter((f) => {
        if (filtro !== "todas" && tipo(f) !== filtro) return false;
        if (!q) return true;
        const puntos = Array.isArray(f.resultado) ? f.resultado : [];
        return [f.resumen, f.cambios, ...puntos.map((p) => `${p.nombre} ${p.detalle}`)].some((t) => String(t ?? "").toLowerCase().includes(q));
      }),
    [filas, filtro, q]
  );
  const hayFiltro = filtro !== "todas" || !!q;

  return (
    <View style={{ flex: 1, backgroundColor: PANEL.bg }}>
      <StatusBar barStyle="dark-content" />
      <AdminHeader title="Revisiones" isMobile={isMobile} />

      {loading ? (
        <AdminLoading texto="Cargando…" />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ width: "100%", maxWidth: 1040, gap: isMobile ? 18 : 22 }}>
            {/* 1) Cifras que filtran la lista (otro toque en la misma, todas). */}
            <FilaCifras nativeID="revisiones-cifras">
              {(
                [
                  ["todas", "Revisiones", "clipboard-outline"],
                  ["fallos", "Con fallos", "close-circle-outline"],
                  ["avisos", "Con avisos", "alert-circle-outline"],
                  ["bien", "Todo bien", "checkmark-circle-outline"],
                ] as const
              ).map(([f, etiqueta, icono]) => (
                <Cifra
                  key={f}
                  nativeID={`revisiones-cifra-${f}`}
                  valor={String(cuenta(f))}
                  etiqueta={etiqueta}
                  icono={icono}
                  ancho={isMobile ? "45%" : 0}
                  alerta={f === "fallos" && cuenta(f) > 0 && filtro !== f}
                  activa={filtro === f && f !== "todas"}
                  onPress={() => setFiltro((x) => (x === f ? "todas" : f))}
                />
              ))}
            </FilaCifras>

            <Detalle>
              La tienda se revisa sola los días 1 y 15 de cada mes (sobre las 7 de la mañana), con la lista de 20 puntos de calidad web.
              Aquí queda apuntado cuándo se hizo, qué se miró y qué se encontró. La revisión automática solo lee: no cambia nada.
            </Detalle>

            {!!err && <AdminNotice tone="danger" text={err} />}

            {/* 2) Buscador y pastillas con su recuento. */}
            <View style={{ gap: 12 }}>
              <Buscador
                nativeID="revisiones-buscar"
                valor={search}
                onCambiar={setSearch}
                placeholder="Buscar en el resumen o en los puntos"
                etiqueta="Buscar revisiones por su resumen, sus cambios o sus puntos"
              />
              <FilaPastillas isMobile={isMobile} nativeID="revisiones-filtros">
                {PASTILLAS.map(([f, t]) => (
                  <Chip key={f} nativeID={`revisiones-filtro-${f}`} label={`${t} (${cuenta(f)})`} activo={filtro === f} onPress={() => setFiltro(f)} />
                ))}
              </FilaPastillas>
            </View>

            {/* 3) Cuántas salen, «Abrir todas» y las filas compactas. */}
            <View style={{ gap: 4 }}>
              <RecuentoLista
                nativeID="revisiones-recuento"
                texto={q ? `${visibles.length} ${visibles.length === 1 ? "revisión encontrada" : "revisiones encontradas"}` : `${visibles.length} de ${filas.length} revisiones`}
                abiertas={desplegables.todasAbiertas(visibles.map((f) => f.id))}
                onAlternar={visibles.length ? () => desplegables.abrirOCerrarTodas(visibles.map((f) => f.id)) : undefined}
                idBoton="revisiones-abrir-todas"
                femenino
              />
              {visibles.length === 0 ? (
                filas.length && hayFiltro ? (
                  <ListaVacia nativeID="revisiones-vacio" icono="clipboard-outline" titulo="No hay revisiones para este filtro." texto="Prueba a borrar el buscador o a elegir «Todas»." />
                ) : err ? null : (
                  <EmptyState icon="clipboard-outline" title="Todavía no hay ninguna revisión." text="La primera aparecerá el próximo día 1 o 15." />
                )
              ) : (
                <View nativeID="revisiones-lista">
                  {visibles.map((f, n) => {
                    const abierta = desplegables.estaAbierta(f.id);
                    const t = ETIQUETA[tipo(f)];
                    const puntos = Array.isArray(f.resultado) ? f.resultado : [];
                    return (
                      <FilaLista
                        key={f.id}
                        nativeID={`revision-${f.id}`}
                        idFila={`revision-fila-${f.id}`}
                        primera={n === 0}
                        abierta={abierta}
                        onPress={() => desplegables.alternar(f.id)}
                        etiquetaAccesible={`Revisión del ${fechaPanel(f.ejecutada_en, true)}, ${t.texto.toLowerCase()}. ${abierta ? "Plegar" : "Ver el detalle"}`}
                        titulo={fechaPanel(f.ejecutada_en, true)}
                        etiqueta={<EtiquetaColor nativeID={`revision-estado-${f.id}`} texto={t.texto} tono={t.tono} />}
                        subtitulo={f.resumen}
                        idSubtitulo={`revision-resumen-${f.id}`}
                        etiquetas={
                          <>
                            <Etiqueta icon="checkmark-circle-outline" color={PANEL.success} texto={`${f.ok} bien`} />
                            <Etiqueta icon="alert-circle-outline" color={PANEL.warning} texto={`${f.avisos} ${f.avisos === 1 ? "aviso" : "avisos"}`} />
                            <Etiqueta icon="close-circle-outline" color={PANEL.danger} texto={`${f.fallos} ${f.fallos === 1 ? "fallo" : "fallos"}`} />
                            <Etiqueta icon="hand-left-outline" color={PANEL.muted} texto={`${f.manuales} los revisa Claude`} />
                          </>
                        }
                      >
                        <DetalleFila nativeID={`revision-detalle-${f.id}`}>
                          <Bloque icono="document-text-outline" titulo="Resumen" ancho={isMobile ? "100%" : "35%"}>
                            <Text style={{ color: PANEL.text, fontSize: TAMANOS.minimo, lineHeight: 19 }}>{f.resumen}</Text>
                            <Dato etiqueta="Qué se cambió">{f.cambios}</Dato>
                            <Dato etiqueta="Cómo se hizo">{f.origen === "manual" ? "Hecha a mano" : "Automática"}</Dato>
                            <Dato etiqueta="Duración">{segundos(f.duracion_ms)}</Dato>
                          </Bloque>
                          <Bloque nativeID={`revision-puntos-${f.id}`} icono="list-outline" titulo={`Puntos revisados (${puntos.length})`} ancho={isMobile ? "100%" : "55%"}>
                            {puntos.length ? (
                              puntos.map((p) => {
                                const s = SIMBOLO[p.estado] ?? SIMBOLO.manual;
                                return (
                                  <View key={p.n} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 2 }}>
                                    <Ionicons name={s.icono} size={16} color={s.color} style={{ marginTop: 2 }} />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                      <Text style={{ color: PANEL.text, fontWeight: "900", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                                        {p.n}. {p.nombre}
                                      </Text>
                                      <Text style={{ color: PANEL.muted, fontSize: TAMANOS.minimo, lineHeight: 18 }}>
                                        {s.texto}: {p.detalle}
                                      </Text>
                                    </View>
                                  </View>
                                );
                              })
                            ) : (
                              <Detalle>Sin puntos apuntados.</Detalle>
                            )}
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
    </View>
  );
}
