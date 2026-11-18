/**
 * Archivo: components/admin/servicios/CobroReparaciones.tsx
 * Función: cobro y envío de una solicitud de reparación en Administración → Servicios: «Marcar como pagado» (forma de pago
 *          y justificante) y el panel de envío de la solicitud (etiqueta de Correos, su importe y su pago).
 * Para qué sirve: lo que antes estaba dentro de app/admin/services.tsx (MarcarPagado y PanelEnvioSolicitud, con
 *          elegirArchivosWeb para los justificantes). Se separó en la tanda 6 de «ordenar el proyecto» (2026-11-18), tal
 *          cual y sin cambiar nada (el dueño lo pidió expresamente: «Muévela también»).
 * Conectado con: lib/supabase.ts (service_requests y el almacén «reparaciones»), lib/envio.ts, api/pago.ts,
 *          components/admin/servicios/PiezasServicios.tsx.
 * Utilizado por: app/admin/services.tsx.
 * Dependencias: react, react-native, @expo/vector-icons.
 * Estado: ACTIVO
 */
import { useState } from "react";
import { Platform, Text, View } from "react-native";
import { supabase } from "../../../lib/supabase";
import { type FotoVisor } from "../../VisorFotos";
import { TACTIL, TAMANOS } from "../../../constants/temaTienda";
import { formatearEurosPanel } from "../../../lib/admin/productos.utilidades";
import { BUCKET_REPARACIONES, COLORS, COLUMNAS_ENVIO_2, ChipButton, FORMAS_PAGO, FORMA_PAGO_LABEL, Seguimiento, ServiceRequestRow, TextField, formaDePago, formatDate, hoyISO } from "./PiezasServicios";

// --- Reparación por envío (dueño, 2026-11-11; migración 20261111100000) ---------------------------------------------

// Elegir archivos en la web (la etiqueta en PDF o las fotos de recepción). En el móvil nativo no hay selector: null.
function elegirArchivosWeb(accept: string, multiple: boolean): Promise<File[] | null> {
  if (Platform.OS !== "web" || typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolver) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolver(input.files ? Array.from(input.files) : []);
    input.click();
  });
}

const EXT_TIPO: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const DIEZ_MB = 10 * 1024 * 1024;

// «Marcar pagado» (parte 2): cómo se pagó y cuándo; el importe lo pone la base de datos. Plegable: se abre y se cierra.
function MarcarPagado({
  id,
  etiqueta,
  isMobile,
  ocupado,
  onGuardar,
}: {
  id: string;
  etiqueta: string;
  isMobile: boolean;
  ocupado: boolean;
  onGuardar: (modo: string, fechaISO: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<string>("bizum");
  const [fecha, setFecha] = useState(hoyISO());
  const valida = /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim()) && !Number.isNaN(new Date(`${fecha.trim()}T12:00:00`).getTime());
  if (!abierto) return <ChipButton label={etiqueta} icon="card-outline" disabled={ocupado} isMobile={isMobile} onPress={() => setAbierto(true)} />;
  return (
    <View nativeID={id} style={{ gap: 6, width: "100%", maxWidth: 520 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
        {FORMAS_PAGO.map((f) => (
          <ChipButton key={f.value} label={f.label} variant={modo === f.value ? "primary" : "ghost"} isMobile={isMobile} onPress={() => setModo(f.value)} />
        ))}
      </View>
      <View style={{ width: "100%", maxWidth: 240 }}>
        <TextField label="Fecha del pago" value={fecha} onChangeText={setFecha} placeholder="AAAA-MM-DD" />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
        <ChipButton
          label={ocupado ? "Guardando…" : "Guardar pago"}
          variant="primary"
          icon="checkmark"
          disabled={ocupado || !valida}
          isMobile={isMobile}
          onPress={() => {
            // Con la hora de ahora si es hoy; si no, a mediodía de ese día.
            const iso = fecha.trim() === hoyISO() ? new Date().toISOString() : new Date(`${fecha.trim()}T12:00:00`).toISOString();
            onGuardar(modo, iso);
            setAbierto(false);
          }}
        />
        <ChipButton label="Cancelar" isMobile={isMobile} onPress={() => setAbierto(false)} />
      </View>
    </View>
  );
}

// Lo de una solicitud por envío: aparatos, etiqueta (coste, pagada, subir), fotos de recepción, espera de pieza y
// presupuesto (y si el cliente lo aceptó). El presupuesto y la pieza también salen en las de recogida. Con la parte 2
// (parte2): forma y fecha del pago de la etiqueta, el diagnóstico («Sin arreglo» con «Te lo compramos por»), qué eligió
// el cliente, sus avisos de pago, «Marcar pagado» de la reparación o la vuelta y «Marcar enviada» con el nº de Correos.
export function PanelEnvioSolicitud({
  request,
  isMobile,
  onSaved,
  onVerFotos,
  parte2 = false,
}: {
  request: ServiceRequestRow;
  isMobile: boolean;
  onSaved: (patch: Partial<ServiceRequestRow>) => void;
  onVerFotos: (fotos: FotoVisor[]) => void;
  parte2?: boolean;
}) {
  const porEnvio = request.entrega_modo === "correos";
  const [presupuesto, setPresupuesto] = useState(request.presupuesto_eur != null ? String(request.presupuesto_eur).replace(".", ",") : "");
  const [pieza, setPieza] = useState(request.espera_pieza_hasta ?? "");
  const [oferta, setOferta] = useState(request.oferta_compra_eur != null ? String(request.oferta_compra_eur).replace(".", ",") : "");
  const [numeroVuelta, setNumeroVuelta] = useState(request.vuelta_seguimiento ?? "");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fotos = Array.isArray(request.recepcion_fotos) ? request.recepcion_fotos : [];

  async function guardar(patch: Partial<ServiceRequestRow>, que: string, ok: string) {
    setOcupado(que);
    setMsg(null);
    // Con la parte 2 se lee la fila guardada: los importes (pagado_eur, vuelta_eur) los pone la base de datos.
    const consulta = supabase.from("service_requests").update(patch).eq("id", request.id);
    const { data, error } = parte2 ? await consulta.select(`id,seguimiento,seguimiento_actualizado,etiqueta_pagada_en,presupuesto_eur,presupuesto_aceptado_en,${COLUMNAS_ENVIO_2}`) : await consulta;
    setOcupado(null);
    if (error) {
      console.error(`Error guardando (${que}):`, error);
      const m = String((error as { message?: string }).message ?? "");
      setMsg({ ok: false, text: /Aún no hay importe|Di cómo se ha pagado/.test(m) ? m : "No se pudo guardar. Inténtalo de nuevo." });
      return false;
    }
    const fila = Array.isArray(data) ? (data[0] as Partial<ServiceRequestRow> | undefined) : undefined;
    onSaved(fila ? { ...patch, ...fila } : patch);
    setMsg({ ok: true, text: ok });
    return true;
  }

  async function subir(tipo: "etiqueta" | "fotos") {
    const archivos = await elegirArchivosWeb(tipo === "etiqueta" ? "application/pdf" : "image/jpeg,image/png,image/webp", tipo === "fotos");
    if (!archivos?.length) return;
    const lista = archivos.slice(0, tipo === "etiqueta" ? 1 : 3);
    if (lista.some((f) => f.size > DIEZ_MB || !EXT_TIPO[f.type])) {
      setMsg({ ok: false, text: tipo === "etiqueta" ? "La etiqueta tiene que ser un PDF de 10 MB como mucho." : "Las fotos tienen que ser JPG, PNG o WebP de 10 MB como mucho." });
      return;
    }
    setOcupado(tipo);
    setMsg(null);
    const rutas: string[] = [];
    for (const [i, f] of lista.entries()) {
      const ruta = `${request.id}/${tipo === "etiqueta" ? "etiqueta" : `recepcion-${i + 1}`}-${Date.now()}.${EXT_TIPO[f.type]}`;
      const { error } = await supabase.storage.from(BUCKET_REPARACIONES).upload(ruta, f, { contentType: f.type, upsert: false });
      if (error) {
        console.error("Error subiendo a reparaciones:", error);
        setOcupado(null);
        setMsg({ ok: false, text: "No se pudo subir el archivo. Inténtalo de nuevo." });
        return;
      }
      rutas.push(ruta);
    }
    setOcupado(null);
    if (tipo === "etiqueta") {
      // Con la etiqueta subida, la solicitud pasa a «Etiqueta lista» (el cliente recibe el aviso de Blue).
      const avanza = !request.seguimiento || request.seguimiento === "solicitado";
      await guardar(
        { etiqueta_path: rutas[0], ...(avanza ? { seguimiento: "etiqueta" as Seguimiento, seguimiento_actualizado: new Date().toISOString() } : null) },
        "etiqueta",
        avanza ? "Etiqueta subida ✓ · la solicitud pasa a «Etiqueta lista»" : "Etiqueta subida ✓"
      );
    } else {
      await guardar({ recepcion_fotos: rutas }, "fotos", `${rutas.length === 1 ? "Foto subida" : `${rutas.length} fotos subidas`} ✓`);
    }
  }

  async function verFotos() {
    if (!fotos.length) return;
    const { data, error } = await supabase.storage.from(BUCKET_REPARACIONES).createSignedUrls(fotos, 300);
    if (error || !data) {
      setMsg({ ok: false, text: "No se pudieron abrir las fotos." });
      return;
    }
    onVerFotos(data.filter((f) => !!f.signedUrl).map((f, i) => ({ id: String(i), url: f.signedUrl as string })));
  }

  async function verEtiqueta() {
    if (!request.etiqueta_path) return;
    const { data } = await supabase.storage.from(BUCKET_REPARACIONES).createSignedUrl(request.etiqueta_path, 60);
    if (data?.signedUrl && typeof window !== "undefined") window.open(data.signedUrl, "_blank", "noopener");
  }

  const precio = Number(presupuesto.replace(/\./g, "").replace(",", "."));
  const presupuestoValido = presupuesto.trim() !== "" && Number.isFinite(precio) && precio >= 0 && precio <= 99999;
  const piezaValida = pieza.trim() === "" || /^\d{4}-\d{2}-\d{2}$/.test(pieza.trim());

  return (
    <View nativeID={`solicitud-envio-${request.id}`} style={{ gap: 8 }}>
      <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
        {porEnvio ? "REPARACIÓN POR ENVÍO" : "PRESUPUESTO"}
      </Text>
      {porEnvio ? (
        <>
          <Text nativeID={`solicitud-envio-datos-${request.id}`} style={{ color: COLORS.text, fontSize: 13, lineHeight: 19 }}>
            <Text style={{ fontWeight: "800" }}>Aparatos: </Text>
            {request.aparatos ?? 1}
            {request.codigo_postal ? ` · C.P. ${request.codigo_postal}` : ""}
            {" · "}
            <Text style={{ fontWeight: "800" }}>Etiqueta: </Text>
            {request.etiqueta_eur != null ? formatearEurosPanel(Number(request.etiqueta_eur)) : "—"}
            {request.etiqueta_peso_kg != null ? ` (${String(request.etiqueta_peso_kg).replace(".", ",")} kg)` : ""}
            {" · "}
            {request.etiqueta_pagada_en
              ? `pagada el ${formatDate(request.etiqueta_pagada_en)}${request.etiqueta_pago_modo ? ` por ${formaDePago(request.etiqueta_pago_modo, request.etiqueta_pago_metodo)}` : ""}`
              : Number(request.etiqueta_eur ?? 0) === 0 && request.etiqueta_eur != null
                ? "gratis"
                : "sin pagar"}
          </Text>
          {request.condiciones_aceptadas_en ? (
            <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 19 }}>Condiciones aceptadas el {formatDate(request.condiciones_aceptadas_en)}</Text>
          ) : null}
          {request.etiqueta_avisada_en && !request.etiqueta_pagada_en ? (
            <Text nativeID={`solicitud-etiqueta-avisada-${request.id}`} style={{ color: COLORS.warning, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
              El cliente dice que ya pagó la etiqueta ({formatDate(request.etiqueta_avisada_en)}): compruébalo y márcala pagada
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
            {!request.etiqueta_pagada_en && parte2 && Number(request.etiqueta_eur ?? 0) > 0 ? (
              <MarcarPagado
                id={`solicitud-etiqueta-pago-${request.id}`}
                etiqueta="Marcar etiqueta pagada"
                isMobile={isMobile}
                ocupado={!!ocupado}
                onGuardar={(modo, iso) => guardar({ etiqueta_pagada_en: iso, etiqueta_pago_modo: modo }, "pagada", `Etiqueta marcada como pagada por ${FORMA_PAGO_LABEL[modo] ?? modo} ✓`)}
              />
            ) : null}
            {!request.etiqueta_pagada_en && !parte2 ? (
              <ChipButton
                label={ocupado === "pagada" ? "Guardando…" : "Marcar etiqueta pagada"}
                icon="card-outline"
                disabled={!!ocupado}
                isMobile={isMobile}
                onPress={() => guardar({ etiqueta_pagada_en: new Date().toISOString() }, "pagada", "Etiqueta marcada como pagada ✓")}
              />
            ) : null}
            <ChipButton
              label={ocupado === "etiqueta" ? "Subiendo…" : request.etiqueta_path ? "Cambiar etiqueta (PDF)" : "Subir etiqueta (PDF)"}
              icon="document-attach-outline"
              disabled={!!ocupado}
              isMobile={isMobile}
              onPress={() => subir("etiqueta")}
            />
            {request.etiqueta_path ? <ChipButton label="Ver etiqueta" icon="eye-outline" isMobile={isMobile} onPress={verEtiqueta} /> : null}
            <ChipButton
              label={ocupado === "fotos" ? "Subiendo…" : fotos.length ? `Cambiar fotos de recepción (${fotos.length})` : "Subir fotos de recepción (hasta 3)"}
              icon="camera-outline"
              disabled={!!ocupado}
              isMobile={isMobile}
              onPress={() => subir("fotos")}
            />
            {fotos.length ? <ChipButton label="Ver fotos" icon="images-outline" isMobile={isMobile} onPress={verFotos} /> : null}
          </View>
        </>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "flex-end", width: "100%", maxWidth: 520 }}>
        <View style={{ flexGrow: 1, flexBasis: 140 }}>
          <TextField label="Presupuesto (€)" value={presupuesto} onChangeText={setPresupuesto} placeholder="Ej: 59,90" keyboardType="decimal-pad" />
        </View>
        <ChipButton
          label={ocupado === "presupuesto" ? "Guardando…" : "Guardar presupuesto"}
          variant="primary"
          icon="checkmark"
          disabled={!!ocupado || !presupuestoValido || precio === Number(request.presupuesto_eur ?? NaN)}
          isMobile={isMobile}
          onPress={() => guardar({ presupuesto_eur: Math.round(precio * 100) / 100 }, "presupuesto", "Presupuesto guardado ✓ · pon la etapa «Presupuesto» para que el cliente lo acepte")}
        />
      </View>
      <Text nativeID={`solicitud-presupuesto-estado-${request.id}`} style={{ color: request.presupuesto_aceptado_en ? COLORS.success : COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
        {request.presupuesto_eur == null
          ? "Sin presupuesto todavía"
          : request.presupuesto_aceptado_en
            ? `El cliente lo aceptó el ${formatDate(request.presupuesto_aceptado_en)}`
            : "El cliente aún no lo ha aceptado"}
      </Text>

      {parte2 ? (
        <View nativeID={`solicitud-cobro-${request.id}`} style={{ gap: 8, width: "100%" }}>
          {/* Diagnóstico: reparable o sin arreglo (con «Te lo compramos por», opcional). */}
          <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>DIAGNÓSTICO</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
            {(["reparable", "sin_arreglo"] as const).map((d) => (
              <ChipButton
                key={d}
                label={d === "reparable" ? "Reparable" : "Sin arreglo"}
                variant={request.diagnostico_resultado === d ? (d === "sin_arreglo" ? "danger" : "primary") : "ghost"}
                disabled={!!ocupado || request.diagnostico_resultado === d}
                isMobile={isMobile}
                onPress={() => guardar({ diagnostico_resultado: d }, "diagnostico", d === "sin_arreglo" ? "Marcada sin arreglo ✓ · el cliente elige «Te lo compramos» o «Devuélvemelo»" : "Marcada reparable ✓")}
              />
            ))}
          </View>
          {request.diagnostico_resultado === "sin_arreglo" ? (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "flex-end", width: "100%", maxWidth: 520 }}>
                <View style={{ flexGrow: 1, flexBasis: 140 }}>
                  <TextField label="Te lo compramos por (€, opcional)" value={oferta} onChangeText={setOferta} placeholder="Ej: 40" keyboardType="decimal-pad" />
                </View>
                <ChipButton
                  label={ocupado === "oferta" ? "Guardando…" : oferta.trim() ? "Guardar oferta" : "Quitar oferta"}
                  icon="pricetag-outline"
                  disabled={!!ocupado || (oferta.trim() !== "" && !(Number(oferta.replace(/\./g, "").replace(",", ".")) >= 0))}
                  isMobile={isMobile}
                  onPress={() => {
                    const n = Number(oferta.replace(/\./g, "").replace(",", "."));
                    guardar({ oferta_compra_eur: oferta.trim() ? Math.round(n * 100) / 100 : null }, "oferta", oferta.trim() ? "Oferta guardada ✓ · el cliente la ve" : "Oferta quitada ✓");
                  }}
                />
              </View>
              <Text nativeID={`solicitud-eleccion-${request.id}`} style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                {request.sin_arreglo_eleccion === "comprar"
                  ? `El cliente eligió «Te lo compramos»${request.sin_arreglo_eleccion_en ? ` el ${formatDate(request.sin_arreglo_eleccion_en)}` : ""}: le llega su solicitud a Vender`
                  : request.sin_arreglo_eleccion === "devolver"
                    ? `El cliente eligió «Devuélvemelo»${request.sin_arreglo_eleccion_en ? ` el ${formatDate(request.sin_arreglo_eleccion_en)}` : ""}${porEnvio ? ` · vuelta ${request.vuelta_eur != null ? formatearEurosPanel(Number(request.vuelta_eur)) : "—"}` : ""}`
                    : `El cliente aún no ha elegido${porEnvio && request.vuelta_eur != null ? ` · la vuelta le costaría ${formatearEurosPanel(Number(request.vuelta_eur))}` : ""}`}
              </Text>
            </>
          ) : null}

          {/* Cobro de la reparación (o de la vuelta si no tiene arreglo). */}
          {porEnvio ? (
            <>
              <Text nativeID={`solicitud-pago-${request.id}`} style={{ color: request.pago_estado === "pagado" ? COLORS.success : COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                {request.pago_estado === "pagado"
                  ? `Pagado ${formatearEurosPanel(Number(request.pagado_eur ?? 0))}${request.pago_modo ? ` por ${formaDePago(request.pago_modo, request.pago_metodo)}` : ""}${request.pagado_en ? ` el ${formatDate(request.pagado_en)}` : ""}`
                  : request.diagnostico_resultado === "sin_arreglo"
                    ? request.sin_arreglo_eleccion === "devolver" && request.vuelta_eur != null
                      ? `Pendiente de pago: la vuelta, ${formatearEurosPanel(Number(request.vuelta_eur))}`
                      : "Sin nada que cobrar todavía"
                    : request.presupuesto_aceptado_en && request.presupuesto_eur != null
                      ? Number(request.presupuesto_eur) === 0
                        ? "Sin coste (garantía)"
                        : `Pendiente de pago: ${formatearEurosPanel(Number(request.presupuesto_eur))}${request.seguimiento === "listo" ? " · el cliente ya puede pagarlo" : " · podrá pagarlo cuando esté «Lista»"}`
                      : "Sin nada que cobrar todavía"}
              </Text>
              {request.pago_avisado_en && request.pago_estado !== "pagado" ? (
                <Text nativeID={`solicitud-pago-avisado-${request.id}`} style={{ color: COLORS.warning, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                  El cliente dice que ya lo pagó ({formatDate(request.pago_avisado_en)}): compruébalo y márcalo pagado
                </Text>
              ) : null}
              {request.pago_estado !== "pagado" &&
              ((request.diagnostico_resultado === "sin_arreglo" && request.sin_arreglo_eleccion === "devolver" && Number(request.vuelta_eur ?? 0) > 0) ||
                (request.diagnostico_resultado !== "sin_arreglo" && !!request.presupuesto_aceptado_en && Number(request.presupuesto_eur ?? 0) > 0)) ? (
                <MarcarPagado
                  id={`solicitud-pago-marcar-${request.id}`}
                  etiqueta={request.diagnostico_resultado === "sin_arreglo" ? "Marcar vuelta pagada" : "Marcar reparación pagada"}
                  isMobile={isMobile}
                  ocupado={!!ocupado}
                  onGuardar={(modo, iso) => guardar({ pago_estado: "pagado", pago_modo: modo, pagado_en: iso }, "pago", `Pagado por ${FORMA_PAGO_LABEL[modo] ?? modo} ✓ · ya puedes enviarlo`)}
                />
              ) : null}
              {/* Pagada (o sin coste): se envía con el número de Correos de la vuelta. */}
              {request.seguimiento !== "enviada" && request.seguimiento !== "entregado" &&
              (request.pago_estado === "pagado" || (request.seguimiento === "listo" && request.presupuesto_aceptado_en && Number(request.presupuesto_eur ?? -1) === 0)) ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "flex-end", width: "100%", maxWidth: 520 }}>
                  <View style={{ flexGrow: 1, flexBasis: 160 }}>
                    <TextField label="Nº de seguimiento de Correos (vuelta)" value={numeroVuelta} onChangeText={setNumeroVuelta} placeholder="Ej: PK123456789ES" />
                  </View>
                  <ChipButton
                    label={ocupado === "enviada" ? "Guardando…" : "Marcar enviada"}
                    variant="primary"
                    icon="paper-plane-outline"
                    disabled={!!ocupado || numeroVuelta.trim().length < 4}
                    isMobile={isMobile}
                    onPress={() =>
                      guardar(
                        { vuelta_seguimiento: numeroVuelta.trim(), seguimiento: "enviada", seguimiento_actualizado: new Date().toISOString() },
                        "enviada",
                        "Enviada de vuelta ✓ · el cliente ve el número de Correos"
                      )
                    }
                  />
                </View>
              ) : request.vuelta_seguimiento ? (
                <Text style={{ color: COLORS.text, fontSize: TAMANOS.minimo, lineHeight: 19 }}>Vuelta por Correos: nº {request.vuelta_seguimiento}</Text>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "flex-end", width: "100%", maxWidth: 520 }}>
        <View style={{ flexGrow: 1, flexBasis: 140 }}>
          <TextField label="Esperando pieza hasta" value={pieza} onChangeText={setPieza} placeholder="AAAA-MM-DD" />
        </View>
        <ChipButton
          label={ocupado === "pieza" ? "Guardando…" : pieza.trim() ? "Guardar fecha" : "Quitar fecha"}
          icon="hourglass-outline"
          disabled={!!ocupado || !piezaValida || pieza.trim() === (request.espera_pieza_hasta ?? "")}
          isMobile={isMobile}
          onPress={() => guardar({ espera_pieza_hasta: pieza.trim() || null }, "pieza", pieza.trim() ? "Fecha de la pieza guardada ✓" : "Fecha quitada ✓")}
        />
      </View>
      {msg ? <Text style={{ color: msg.ok ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>{msg.text}</Text> : null}
    </View>
  );
}
