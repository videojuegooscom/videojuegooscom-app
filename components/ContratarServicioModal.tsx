// components/ContratarServicioModal.tsx
/**
 * Qué hace: modal ("pop") que se abre al pulsar "Contratar servicio ahora"
 * en la ficha de un servicio (app/servicio/[id].tsx). Es el formulario para
 * clientes que quieren contratar ese servicio: datos de contacto (nombre,
 * apellido, método de contacto y su dato), ciudad, dirección donde se
 * necesita el servicio, disponibilidad horaria y un comentario libre con
 * los detalles. Al enviarlo se guarda directamente en Supabase (tabla
 * "service_requests", ver sql/service_requests.sql) — no se envía ningún
 * email. Mismo espíritu que components/VenderAhoraModal.tsx ("Vender
 * ahora") pero mucho más corto: aquí no hay que describir un artículo que
 * se vende ni adjuntar fotos, solo decir qué servicio se quiere contratar y
 * cómo contactar.
 *
 * Cómo funciona:
 * - Responsive igual que el resto de modales del panel: en móvil una sola
 *   columna a ancho completo; en escritorio crece hasta un máximo cómodo
 *   (560px) y Nombre/Apellido van en pareja.
 * - "Método de contacto" (WhatsApp/Gmail/Instagram/Facebook/TikTok) se
 *   elige con chips; según cuál se elija cambia el prefijo del campo de
 *   contacto (+34 para WhatsApp, @ para redes, nada para Gmail).
 * - "Disponibilidad" (Mañana/Mediodía/Tarde y noche) también con chips.
 * - Botones y chips tienen una pequeña animación "pop" al pulsarlos
 *   (Animated.spring, encoge y vuelve), igual que el resto de la app.
 * - El botón de enviar solo se activa cuando los campos obligatorios están
 *   completos (nombre, apellido, ciudad, método de contacto + su dato).
 *   Dirección, disponibilidad y comentario son opcionales.
 * - Tras un envío correcto muestra una pantalla de confirmación dentro del
 *   propio modal, con opción de cerrar.
 * - Tema claro global (fondo blanco, texto azul marino, acentos azul
 *   claro). Fondo oscuro semitransparente detrás de la tarjeta, igual que
 *   el resto de modales de la app.
 *
 * Conectado con:
 * - sql/service_requests.sql → tabla e INSERT público que hace este modal.
 * - app/servicio/[id].tsx → quien monta y abre este modal, pasándole qué
 *   servicio se está contratando (id + título).
 * - app/admin/services.tsx (pestaña "Solicitudes") → donde Jefe revisa cada
 *   envío.
 */
import React, { useMemo, useRef, useState } from "react";
import { Animated, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

const COLORS = {
  bg: "#FFFFFF",
  card: "#F6FAFD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  accentDark: "#0E86C4",
  success: "#15803D",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  dangerBorder: "#FDA4AF",
};

const modalColumnStyle = { width: "100%", maxWidth: 560, alignSelf: "center" } as const;

type MetodoContacto = "whatsapp" | "gmail" | "instagram" | "facebook" | "tiktok";
type Disponibilidad = "manana" | "mediodia" | "tardenoche";

const METODO_OPTIONS: { value: MetodoContacto; label: string; prefix: string; placeholder: string }[] = [
  { value: "whatsapp", label: "WhatsApp", prefix: "+34", placeholder: "600 000 000" },
  { value: "gmail", label: "Gmail", prefix: "", placeholder: "tucorreo@gmail.com" },
  { value: "instagram", label: "Instagram", prefix: "@", placeholder: "usuario" },
  { value: "facebook", label: "Facebook", prefix: "@", placeholder: "usuario" },
  { value: "tiktok", label: "TikTok", prefix: "@", placeholder: "usuario" },
];

const DISPONIBILIDAD_OPTIONS: { value: Disponibilidad; label: string }[] = [
  { value: "manana", label: "Mañana" },
  { value: "mediodia", label: "Mediodía" },
  { value: "tardenoche", label: "Tarde y noche" },
];

function AnimatedPressable({
  onPress,
  disabled,
  children,
  style,
}: {
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  style?: any;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function pressIn() {
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  }
  function pressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  }

  return (
    <Pressable onPress={onPress} disabled={disabled} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>{children}</Text>;
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  prefix,
  flex,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  prefix?: string;
  flex?: number;
}) {
  return (
    <View style={{ gap: 6, flex }}>
      <FieldLabel>{label}</FieldLabel>
      <View
        style={{
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 14,
          backgroundColor: COLORS.cardSoft,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 2,
        }}
      >
        {!!prefix && (
          <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 16, marginRight: 2 }}>{prefix}</Text>
        )}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.muted2}
          multiline={!!multiline}
          style={{
            flex: 1,
            fontSize: 16,
            color: COLORS.text,
            paddingVertical: multiline ? 0 : 10,
            minHeight: multiline ? 80 : undefined,
            textAlignVertical: multiline ? "top" : "center",
          }}
        />
      </View>
    </View>
  );
}

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <FieldLabel>{label}</FieldLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <AnimatedPressable key={opt.value} onPress={() => onChange(opt.value)}>
              <View
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? COLORS.accentBorder : COLORS.border,
                  backgroundColor: active ? COLORS.accent2 : COLORS.cardSoft,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>{opt.label}</Text>
              </View>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

export default function ContratarServicioModal({
  visible,
  service,
  onClose,
}: {
  visible: boolean;
  service: { id: string; title: string } | null;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;

  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [metodo, setMetodo] = useState<MetodoContacto | null>(null);
  const [contacto, setContacto] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [direccion, setDireccion] = useState("");
  const [disponibilidad, setDisponibilidad] = useState<Disponibilidad | null>(null);
  const [comentario, setComentario] = useState("");

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metodoOption = useMemo(() => METODO_OPTIONS.find((m) => m.value === metodo) ?? null, [metodo]);

  const isValid =
    nombre.trim().length >= 2 &&
    apellido.trim().length >= 2 &&
    ciudad.trim().length >= 2 &&
    !!metodo &&
    contacto.trim().length >= 3;

  function reset() {
    setNombre("");
    setApellido("");
    setMetodo(null);
    setContacto("");
    setCiudad("");
    setDireccion("");
    setDisponibilidad(null);
    setComentario("");
    setSending(false);
    setSent(false);
    setError(null);
  }

  function handleClose() {
    onClose();
    setTimeout(reset, 250);
  }

  async function submit() {
    if (!service || !isValid || sending) return;

    setSending(true);
    setError(null);

    try {
      const { error: insertError } = await supabase.from("service_requests").insert({
        service_id: service.id,
        service_title: service.title,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        metodo_contacto: metodo,
        contacto: contacto.trim(),
        ciudad: ciudad.trim(),
        direccion: direccion.trim() || null,
        disponibilidad,
        comentario: comentario.trim() || null,
      });

      if (insertError) throw insertError;
      setSent(true);
    } catch (e: any) {
      console.error("Error enviando la solicitud de servicio:", e);
      setError(e?.message ?? "No se pudo enviar la solicitud. Inténtalo de nuevo en unos instantes.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.55)", padding: 16, justifyContent: "center" }}>
        <View
          style={{
            ...modalColumnStyle,
            maxHeight: "90%",
            borderRadius: 22,
            backgroundColor: COLORS.bg,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: COLORS.border,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 17, flex: 1 }} numberOfLines={1}>
              {sent ? "Solicitud enviada" : `Contratar: ${service?.title ?? "servicio"}`}
            </Text>
            <Pressable onPress={handleClose} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, padding: 4 })}>
              <Ionicons name="close" size={22} color={COLORS.text} />
            </Pressable>
          </View>

          {sent ? (
            <View style={{ padding: 24, alignItems: "center", gap: 12 }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: COLORS.successBg,
                  borderWidth: 1,
                  borderColor: COLORS.successBorder,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="checkmark" size={28} color={COLORS.success} />
              </View>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
                ¡Solicitud recibida!
              </Text>
              <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>
                Nos pondremos en contacto contigo lo antes posible para confirmar los detalles de "
                {service?.title}".
              </Text>
              <AnimatedPressable onPress={handleClose}>
                <View
                  style={{
                    marginTop: 4,
                    borderRadius: 999,
                    paddingVertical: 12,
                    paddingHorizontal: 24,
                    backgroundColor: COLORS.accent,
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Cerrar</Text>
                </View>
              </AnimatedPressable>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
              <View style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}>
                <TextField label="Nombre" value={nombre} onChangeText={setNombre} placeholder="Tu nombre" flex={1} />
                <TextField label="Apellido" value={apellido} onChangeText={setApellido} placeholder="Tu apellido" flex={1} />
              </View>

              <ChipGroup label="Método de contacto" options={METODO_OPTIONS} value={metodo} onChange={setMetodo} />

              {metodoOption && (
                <TextField
                  label={`Tu ${metodoOption.label}`}
                  value={contacto}
                  onChangeText={setContacto}
                  placeholder={metodoOption.placeholder}
                  prefix={metodoOption.prefix || undefined}
                />
              )}

              <TextField label="Ciudad" value={ciudad} onChangeText={setCiudad} placeholder="Zaragoza" />
              <TextField
                label="Dirección (opcional)"
                value={direccion}
                onChangeText={setDireccion}
                placeholder="Dónde necesitas el servicio"
              />

              <ChipGroup
                label="Disponibilidad (opcional)"
                options={DISPONIBILIDAD_OPTIONS}
                value={disponibilidad}
                onChange={setDisponibilidad}
              />

              <TextField
                label="Cuéntanos qué necesitas (opcional)"
                value={comentario}
                onChangeText={setComentario}
                placeholder="Detalles del problema, modelo del dispositivo, urgencia…"
                multiline
              />

              {!!error && (
                <View style={{ borderRadius: 12, borderWidth: 1, borderColor: COLORS.dangerBorder, backgroundColor: COLORS.dangerBg, padding: 10 }}>
                  <Text style={{ color: COLORS.danger, fontWeight: "700", fontSize: 12.5 }}>{error}</Text>
                </View>
              )}

              <AnimatedPressable onPress={submit} disabled={!isValid || sending}>
                <View
                  style={{
                    borderRadius: 999,
                    paddingVertical: 14,
                    alignItems: "center",
                    backgroundColor: isValid ? COLORS.accentDark : COLORS.border,
                    opacity: sending ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: isValid ? "#FFFFFF" : COLORS.muted2, fontWeight: "900", fontSize: 15 }}>
                    {sending ? "Enviando…" : "Enviar solicitud"}
                  </Text>
                </View>
              </AnimatedPressable>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
