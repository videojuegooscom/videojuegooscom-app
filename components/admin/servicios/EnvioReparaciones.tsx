/**
 * Archivo: components/admin/servicios/EnvioReparaciones.tsx
 * Función: el seguimiento de cada solicitud de reparación (etapa, nota del taller, presupuesto, fotos de recepción) y los
 *          ajustes de la reparación por envío (si está activa, pesos, datos de pago manual) en Administración → Servicios.
 * Para qué sirve: lo que antes estaba dentro de app/admin/services.tsx (RequestSeguimiento y AjustesEnvioPanel). Se separó
 *          en la tanda 6 de «ordenar el proyecto» (2026-11-18), sin cambiar nada.
 * Conectado con: lib/supabase.ts (service_requests, reparacion_envio_ajustes), lib/envio.ts,
 *          components/admin/servicios/PiezasServicios.tsx.
 * Utilizado por: app/admin/services.tsx.
 * Dependencias: react, react-native, @expo/vector-icons.
 * Estado: ACTIVO
 */
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "../../../lib/supabase";
import { cargarAjustesReparacionEnvio, cargarTarifas, hayTarifaCorreos, type AjustesReparacionEnvio } from "../../../lib/envio";
import { TACTIL, TAMANOS } from "../../../constants/temaTienda";
import { AvisoPanel } from "../../../lib/admin/productos.componentes";
import { COLORS, ChipButton, SEGUIMIENTO_ETAPAS, SEGUIMIENTO_ETAPAS_ENVIO, SEGUIMIENTO_ETAPAS_RECOGIDA, SEGUIMIENTO_LABEL, Seguimiento, ServiceRequestRow, TextField, faltaEsquema, formatDate } from "./PiezasServicios";

// Etapa de seguimiento + nota para el cliente (se ve en Perfil → Seguimientos).
export function RequestSeguimiento({
  request,
  disponible,
  isMobile,
  onSaved,
  onMissingMigration,
  envioOk = false,
}: {
  request: ServiceRequestRow;
  disponible: boolean;
  isMobile: boolean;
  // ¿Existe ya la reparación por envío (migración 20261111100000)? Entonces hay más etapas.
  envioOk?: boolean;
  onSaved: (patch: Partial<ServiceRequestRow>) => void;
  onMissingMigration: () => void;
}) {
  const [etapa, setEtapa] = useState<Seguimiento>(request.seguimiento ?? "solicitado");
  const [nota, setNota] = useState(request.seguimiento_nota ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!disponible) {
    return (
      <Text style={{ color: COLORS.warning, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
        Falta aplicar la migración de seguimiento
      </Text>
    );
  }

  const cambiado = etapa !== (request.seguimiento ?? "solicitado") || nota.trim() !== (request.seguimiento_nota ?? "");

  async function guardar() {
    if (saving) return;
    setSaving(true);
    setMsg(null);
    const patch = {
      seguimiento: etapa,
      seguimiento_nota: nota.trim() || null,
      seguimiento_actualizado: new Date().toISOString(),
    };
    const { error } = await supabase.from("service_requests").update(patch).eq("id", request.id);
    setSaving(false);
    if (error) {
      if (faltaEsquema(error)) {
        onMissingMigration();
        return;
      }
      console.error("Error guardando el seguimiento:", error);
      setMsg({ ok: false, text: "No se pudo guardar el seguimiento." });
      return;
    }
    onSaved(patch);
    setMsg({ ok: true, text: "Seguimiento guardado ✓" });
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
        SEGUIMIENTO PARA EL CLIENTE
        {request.seguimiento_actualizado ? ` · ${formatDate(request.seguimiento_actualizado)}` : ""}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
        {(!envioOk ? SEGUIMIENTO_ETAPAS : request.entrega_modo === "correos" ? SEGUIMIENTO_ETAPAS_ENVIO : SEGUIMIENTO_ETAPAS_RECOGIDA).map((s) => (
          <ChipButton
            key={s}
            label={request.entrega_modo === "correos" && s === "listo" ? "Lista" : SEGUIMIENTO_LABEL[s]}
            variant={etapa === s ? (s === "cancelado" ? "danger" : "primary") : "ghost"}
            onPress={() => {
              setEtapa(s);
              setMsg(null);
            }}
            isMobile={isMobile}
          />
        ))}
      </View>
      <TextInput
        value={nota}
        onChangeText={(t) => {
          setNota(t.slice(0, 500));
          setMsg(null);
        }}
        placeholder="Nota para el cliente (opcional)"
        placeholderTextColor={COLORS.muted2}
        maxLength={500}
        style={{
          width: "100%",
          maxWidth: 520,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 10,
          fontSize: 16,
          color: COLORS.text,
          backgroundColor: COLORS.cardSoft,
          textAlign: "center",
        }}
      />
      <ChipButton
        label={saving ? "Guardando…" : "Guardar seguimiento"}
        variant="primary"
        icon="checkmark"
        disabled={saving || !cambiado}
        onPress={guardar}
        isMobile={isMobile}
      />
      {msg ? (
        <Text style={{ color: msg.ok ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: TAMANOS.minimo }}>
          {msg.text}
        </Text>
      ) : null}
    </View>
  );
}

// Ajustes de la reparación por envío (fila única reparacion_envio_ajustes), plegados en «Solicitudes». No se activa sin
// la dirección del taller, con el peso por aparato aún estimado o sin tarifa de Correos (y se dice qué falta).
export function AjustesEnvioPanel({ isMobile }: { isMobile: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [aj, setAj] = useState<AjustesReparacionEnvio | null | undefined>(undefined);
  const [tarifaOk, setTarifaOk] = useState(false);
  const [form, setForm] = useState({ direccion: "", peso: "", custodia: "", bizum: "", iban: "", titular: "", plazo: "", garantia: "12" });
  const [pesoTocado, setPesoTocado] = useState(false);
  const [activo, setActivo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ tono: "success" | "warning"; texto: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([cargarAjustesReparacionEnvio(), cargarTarifas()]).then(([a, t]) => {
      if (!vivo) return;
      setAj(a);
      setTarifaOk(hayTarifaCorreos(t));
      if (a) {
        setActivo(a.activo);
        setForm({
          direccion: a.direccion_taller ?? "",
          peso: String(a.peso_aparato_kg).replace(".", ","),
          custodia: a.dias_custodia != null ? String(a.dias_custodia) : "",
          bizum: a.bizum ?? "",
          iban: a.iban ?? "",
          titular: a.titular ?? "",
          plazo: String(a.plazo_horas),
          garantia: String(a.garantia_meses),
        });
      }
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (aj === undefined) return null;
  if (aj === null) {
    return (
      <Text nativeID="reparacion-envio-ajustes" style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
        Reparación por envío: falta aplicar su migración (20261111100000).
      </Text>
    );
  }

  const peso = Number(form.peso.replace(",", "."));
  const pesoValido = Number.isFinite(peso) && peso > 0 && peso <= 30;
  const pesoEstimado = aj.peso_estimado && !pesoTocado;
  const faltan = [
    form.direccion.trim().length >= 10 ? null : "la dirección del taller",
    pesoEstimado || !pesoValido ? "el peso real por aparato" : null,
    tarifaOk ? null : "una tarifa de Correos por kilos (Administración → Tarifas de envío)",
  ].filter(Boolean) as string[];
  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (k === "peso") setPesoTocado(true);
    setMsg(null);
  };

  async function guardar() {
    if (guardando) return;
    const custodia = form.custodia.trim() ? Math.round(Number(form.custodia)) : null;
    const plazo = Math.round(Number(form.plazo || "72"));
    const garantia = Math.round(Number(form.garantia || "12"));
    if (!pesoValido || (custodia !== null && !(custodia >= 1 && custodia <= 365)) || !(plazo >= 1 && plazo <= 2000) || (aj!.parte2 && !(garantia >= 1 && garantia <= 60))) {
      setMsg({ tono: "warning", texto: "Revisa el peso (hasta 30 kg), los días de custodia (1-365), el plazo en horas y los meses de garantía (1-60)." });
      return;
    }
    const activar = activo && faltan.length === 0;
    setGuardando(true);
    const { data: sesion } = await supabase.auth.getSession();
    const patch = {
      activo: activar,
      direccion_taller: form.direccion.trim() || null,
      peso_aparato_kg: Math.round(peso * 1000) / 1000,
      ...(pesoTocado ? { peso_estimado: false } : null),
      dias_custodia: custodia,
      bizum: form.bizum.trim() || null,
      iban: form.iban.replace(/\s+/g, " ").trim() || null,
      titular: form.titular.trim() || null,
      plazo_horas: plazo,
      ...(aj!.parte2 ? { garantia_meses: garantia } : null),
      updated_at: new Date().toISOString(),
      updated_by: sesion.session?.user?.id ?? null,
    };
    const { error } = await supabase.from("reparacion_envio_ajustes").update(patch).eq("id", 1);
    setGuardando(false);
    if (error) {
      console.error("Error guardando la reparación por envío:", error);
      setMsg({ tono: "warning", texto: "No se pudo guardar. Revisa los datos (dirección de 10 a 300 letras, IBAN de 15 a 42)." });
      return;
    }
    setAj({ ...aj!, ...patch, peso_estimado: pesoTocado ? false : aj!.peso_estimado });
    setActivo(activar);
    setPesoTocado(false);
    setMsg({ tono: "success", texto: activar ? "Guardado ✓ · la reparación por envío está activada" : "Guardado ✓ · la reparación por envío está desactivada" });
  }

  return (
    <View nativeID="reparacion-envio-ajustes" style={{ gap: 10, alignItems: "center" }}>
      <Pressable
        nativeID="reparacion-envio-ajustes-abrir"
        onPress={() => setAbierto((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierto }}
        style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.7 : 1 })}
      >
        <Ionicons name="cube-outline" size={18} color={COLORS.accent} />
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 14 }}>
          Reparación por envío · {aj.activo ? "activada" : "desactivada"}
        </Text>
        <Ionicons name={abierto ? "chevron-up" : "chevron-down"} size={16} color={COLORS.text} />
      </Pressable>
      {abierto ? (
        <View nativeID="reparacion-envio-ajustes-form" style={{ gap: 10, width: "100%", maxWidth: 560 }}>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
            <ChipButton label="Desactivada" variant={!activo ? "primary" : "ghost"} isMobile={isMobile} onPress={() => setActivo(false)} />
            <ChipButton
              label="Activada"
              variant={activo ? "primary" : "ghost"}
              disabled={faltan.length > 0}
              isMobile={isMobile}
              onPress={() => setActivo(true)}
            />
          </View>
          {faltan.length ? (
            <AvisoPanel tone="warning" text={`Para activarla falta: ${faltan.join(" · ")}.`} />
          ) : null}
          <TextField label="Dirección del taller (a dónde lo envía el cliente)" value={form.direccion} onChangeText={set("direccion")} placeholder="Nombre, calle, número, código postal y ciudad" multiline />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <View style={{ flexGrow: 1, flexBasis: isMobile ? "45%" : "22%" }}>
              <TextField
                label={aj.parte2 ? "Peso por defecto (si el servicio no tiene el suyo)" : "Peso por aparato (kg)"}
                value={form.peso}
                onChangeText={set("peso")}
                placeholder="Ej: 3,5"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flexGrow: 1, flexBasis: isMobile ? "45%" : "22%" }}>
              <TextField label="Plazo (horas)" value={form.plazo} onChangeText={set("plazo")} placeholder="72" keyboardType="numeric" />
            </View>
            <View style={{ flexGrow: 1, flexBasis: isMobile ? "45%" : "22%" }}>
              <TextField label="Días de custodia" value={form.custodia} onChangeText={set("custodia")} placeholder="Los decides tú" keyboardType="numeric" />
            </View>
            <View style={{ flexGrow: 1, flexBasis: isMobile ? "45%" : "22%" }}>
              <TextField label="Bizum" value={form.bizum} onChangeText={set("bizum")} placeholder="Número de Bizum" />
            </View>
            {aj.parte2 ? (
              <View style={{ flexGrow: 1, flexBasis: isMobile ? "45%" : "22%" }}>
                <TextField label="Garantía (meses)" value={form.garantia} onChangeText={set("garantia")} placeholder="12" keyboardType="numeric" />
              </View>
            ) : null}
          </View>
          {aj.parte2 ? (
            <Text nativeID="reparacion-envio-pagos-aviso" style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
              El Bizum, el IBAN y el titular se enseñan al cliente para pagar la etiqueta y la reparación (solo los que rellenes), con su
              número VZ- como concepto. El peso de cada aparato se pone en la ficha de cada servicio (Catálogo); este es el de respaldo.
            </Text>
          ) : null}
          {pesoEstimado ? (
            <Text nativeID="reparacion-envio-peso-estimado" style={{ color: COLORS.warning, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
              Peso estimado ({form.peso} kg con embalaje): corrígelo con el real de lo que más reparas.
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <View style={{ flexGrow: 1, flexBasis: isMobile ? "100%" : "45%" }}>
              <TextField label={aj.parte2 ? "IBAN (se enseña al cliente)" : "IBAN (para la parte de pago)"} value={form.iban} onChangeText={set("iban")} placeholder="ES00 0000 0000 0000 0000 0000" />
            </View>
            <View style={{ flexGrow: 1, flexBasis: isMobile ? "100%" : "45%" }}>
              <TextField label="Titular" value={form.titular} onChangeText={set("titular")} placeholder="Nombre del titular" />
            </View>
          </View>
          <View style={{ alignItems: "center" }}>
            <ChipButton label={guardando ? "Guardando…" : "Guardar ajustes"} variant="primary" icon="checkmark" disabled={guardando} isMobile={isMobile} onPress={guardar} />
          </View>
          {msg ? <AvisoPanel tone={msg.tono} text={msg.texto} /> : null}
        </View>
      ) : null}
    </View>
  );
}
