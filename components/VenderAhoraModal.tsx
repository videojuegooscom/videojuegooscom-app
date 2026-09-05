// components/VenderAhoraModal.tsx
/**
 * Qué hace: modal ("pop") que se abre al pulsar "Vender ahora". Es un
 * formulario corto para clientes que quieren vender su consola/electrónica:
 * qué artículo es, si funciona bien o no (con su pregunta según la
 * respuesta), en qué ciudad están, cuánto esperan recibir y, si quieren,
 * un contacto. Al enviarlo se guarda directamente en Supabase — no se envía
 * ningún email.
 *
 * Cómo funciona:
 * - Ocupa el ancho completo (hasta un máximo cómodo de lectura) tanto en
 *   móvil como en escritorio, con una animación de entrada tipo "pop"
 *   (fade + spring de escala) hecha con Animated.
 * - "¿Todo funciona perfectamente?" es un selector Sí/No. Si es Sí, pide el
 *   motivo de la venta; si es No, pide una breve descripción del problema.
 * - Al pulsar "Enviar formulario" hace un INSERT en la tabla pública
 *   "sell_requests" (ver sql/sell_requests.sql) con status inicial "nuevo".
 *   Cualquiera puede insertar (política RLS pública de solo INSERT); nadie
 *   sin rol admin puede leer esas filas.
 * - Tras un envío correcto muestra una pantalla de confirmación dentro del
 *   propio modal y se puede cerrar con "Cerrar".
 * - Sigue el tema claro global de la app (fondo blanco, texto azul marino,
 *   acentos azul claro). El fondo oscuro semitransparente detrás de la
 *   tarjeta se mantiene oscuro a propósito, igual que en el resto de
 *   modales del panel admin.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente usado para el INSERT.
 * - app/(tabs)/index.tsx → abre este modal desde el botón "Vender ahora".
 * - app/admin/cotizaciones.tsx → panel donde el admin ve lo que aquí se
 *   envía.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

const COLORS = {
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accentDark: "#0F8FCC",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  success: "#15803D",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  dangerBorder: "#FDA4AF",
};

// Ancho máximo del "pop": ocupa todo el ancho disponible hasta este límite,
// tanto en móvil como en escritorio.
const modalColumnStyle = { width: "100%", maxWidth: 640, alignSelf: "center" } as const;

function softShadow() {
  return Platform.select<any>({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.28,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
    },
    android: { elevation: 6 },
    default: {},
  });
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 14, lineHeight: 19 }}>
      {children}
    </Text>
  );
}

function FieldInput(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor="rgba(11,33,56,0.40)"
      style={{
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 12,
        color: COLORS.text,
        backgroundColor: COLORS.cardSoft,
        fontSize: 14,
      }}
      {...props}
    />
  );
}

function YesNoChoice({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      {[
        { label: "Sí", v: true },
        { label: "No", v: false },
      ].map((opt) => {
        const active = value === opt.v;
        return (
          <Pressable
            key={opt.label}
            onPress={() => onChange(opt.v)}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: "center",
              borderWidth: 1,
              borderColor: active ? COLORS.accentBorder : COLORS.border,
              backgroundColor: active ? COLORS.accent2 : COLORS.cardSoft,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text
              style={{
                color: COLORS.text,
                fontWeight: "900",
                fontSize: 14,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type SellRequestPayload = {
  articulo: string;
  funciona_bien: boolean;
  motivo_venta: string | null;
  descripcion_problema: string | null;
  ciudad: string;
  precio_estimado: string;
  contacto: string | null;
  status: "nuevo";
};

export default function VenderAhoraModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;

  const [articulo, setArticulo] = useState("");
  const [funcionaBien, setFuncionaBien] = useState<boolean | null>(null);
  const [motivoVenta, setMotivoVenta] = useState("");
  const [descripcionProblema, setDescripcionProblema] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [precioEstimado, setPrecioEstimado] = useState("");
  const [contacto, setContacto] = useState("");

  const [sending, setSending] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.9);
      fadeAnim.setValue(0);

      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 90,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, scaleAnim, fadeAnim]);

  function resetForm() {
    setArticulo("");
    setFuncionaBien(null);
    setMotivoVenta("");
    setDescripcionProblema("");
    setCiudad("");
    setPrecioEstimado("");
    setContacto("");
    setFormErr(null);
    setSent(false);
  }

  function handleClose() {
    if (sending) return;
    onClose();
    // Pequeño margen para que no se vea el formulario "vaciándose" antes
    // de que termine la animación de cierre del Modal.
    setTimeout(resetForm, 250);
  }

  async function handleSubmit() {
    if (sending) return;

    const cleanArticulo = articulo.trim();
    const cleanCiudad = ciudad.trim();
    const cleanPrecio = precioEstimado.trim();
    const cleanMotivo = motivoVenta.trim();
    const cleanProblema = descripcionProblema.trim();
    const cleanContacto = contacto.trim();

    if (!cleanArticulo) {
      setFormErr("Cuéntanos qué artículo quieres vender.");
      return;
    }

    if (funcionaBien === null) {
      setFormErr("Indica si el artículo funciona perfectamente o no.");
      return;
    }

    if (funcionaBien && !cleanMotivo) {
      setFormErr("Indica el motivo de la venta.");
      return;
    }

    if (!funcionaBien && !cleanProblema) {
      setFormErr("Describe brevemente qué le sucede al artículo.");
      return;
    }

    if (!cleanCiudad) {
      setFormErr("Indica en qué ciudad te encuentras.");
      return;
    }

    if (!cleanPrecio) {
      setFormErr("Indica cuánto estimas recibir por tu artículo.");
      return;
    }

    setFormErr(null);
    setSending(true);

    const payload: SellRequestPayload = {
      articulo: cleanArticulo,
      funciona_bien: funcionaBien,
      motivo_venta: funcionaBien ? cleanMotivo : null,
      descripcion_problema: !funcionaBien ? cleanProblema : null,
      ciudad: cleanCiudad,
      precio_estimado: cleanPrecio,
      contacto: cleanContacto || null,
      status: "nuevo",
    };

    try {
      const { error } = await supabase.from("sell_requests").insert(payload);
      if (error) throw error;
      setSent(true);
    } catch (e: any) {
      setFormErr(
        e?.message ?? "No se pudo enviar el formulario. Inténtalo de nuevo en unos segundos."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.60)",
          padding: isMobile ? 10 : 20,
          justifyContent: "center",
        }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={{
              ...modalColumnStyle,
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            }}
          >
            <View
              style={{
                borderRadius: 22,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.bg2,
                padding: isMobile ? 16 : 20,
                gap: 14,
                ...softShadow(),
              }}
            >
              {sent ? (
                <View style={{ alignItems: "center", gap: 12, paddingVertical: 10 }}>
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: COLORS.successBg,
                      borderWidth: 1,
                      borderColor: COLORS.successBorder,
                    }}
                  >
                    <Ionicons name="checkmark" size={28} color={COLORS.success} />
                  </View>

                  <Text
                    style={{
                      color: COLORS.text,
                      fontWeight: "900",
                      fontSize: 18,
                      textAlign: "center",
                    }}
                  >
                    ¡Formulario enviado!
                  </Text>

                  <Text
                    style={{
                      color: COLORS.muted,
                      textAlign: "center",
                      lineHeight: 20,
                    }}
                  >
                    Hemos recibido los datos de tu artículo. Nuestro equipo lo revisará y se
                    pondrá en contacto contigo.
                  </Text>

                  <Pressable
                    onPress={handleClose}
                    style={({ pressed }) => ({
                      marginTop: 4,
                      opacity: pressed ? 0.9 : 1,
                      borderRadius: 999,
                      paddingVertical: 12,
                      paddingHorizontal: 20,
                      backgroundColor: COLORS.accent,
                    })}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Cerrar</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: COLORS.text,
                          fontSize: isMobile ? 19 : 21,
                          fontWeight: "900",
                          lineHeight: 26,
                        }}
                      >
                        Vender mi artículo
                      </Text>
                      <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 20 }}>
                        Cuéntanos lo básico y te contactamos con una propuesta.
                      </Text>
                    </View>

                    <Pressable
                      onPress={handleClose}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.8 : 1,
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: COLORS.card,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                      })}
                    >
                      <Ionicons name="close" size={18} color={COLORS.text} />
                    </Pressable>
                  </View>

                  <View style={{ gap: 6 }}>
                    <FieldLabel>¿Qué artículo de electrónica o relacionado quieres vender?</FieldLabel>
                    <FieldInput
                      value={articulo}
                      onChangeText={(v) => {
                        setArticulo(v);
                        setFormErr(null);
                      }}
                      placeholder="Ej: PlayStation 5 con dos mandos"
                      multiline
                    />
                  </View>

                  <View style={{ gap: 6 }}>
                    <FieldLabel>¿Todo funciona perfectamente?</FieldLabel>
                    <YesNoChoice
                      value={funcionaBien}
                      onChange={(v) => {
                        setFuncionaBien(v);
                        setFormErr(null);
                      }}
                    />
                  </View>

                  {funcionaBien === true && (
                    <View style={{ gap: 6 }}>
                      <FieldLabel>¿Cuál es el motivo de la venta?</FieldLabel>
                      <FieldInput
                        value={motivoVenta}
                        onChangeText={(v) => {
                          setMotivoVenta(v);
                          setFormErr(null);
                        }}
                        placeholder="Ej: ya no lo uso, cambio de consola..."
                        multiline
                      />
                    </View>
                  )}

                  {funcionaBien === false && (
                    <View style={{ gap: 6 }}>
                      <FieldLabel>
                        ¿Puedes hacernos una breve descripción de qué es lo que le sucede?
                      </FieldLabel>
                      <FieldInput
                        value={descripcionProblema}
                        onChangeText={(v) => {
                          setDescripcionProblema(v);
                          setFormErr(null);
                        }}
                        placeholder="Ej: no lee discos, la batería no carga..."
                        multiline
                      />
                    </View>
                  )}

                  <View style={{ gap: 6 }}>
                    <FieldLabel>¿En qué ciudad te encuentras?</FieldLabel>
                    <FieldInput
                      value={ciudad}
                      onChangeText={(v) => {
                        setCiudad(v);
                        setFormErr(null);
                      }}
                      placeholder="Ej: Zaragoza"
                    />
                  </View>

                  <View style={{ gap: 6 }}>
                    <FieldLabel>¿Cuánto estimas recibir por tu artículo?</FieldLabel>
                    <FieldInput
                      value={precioEstimado}
                      onChangeText={(v) => {
                        setPrecioEstimado(v);
                        setFormErr(null);
                      }}
                      placeholder="Ej: 150€"
                    />
                  </View>

                  <View style={{ gap: 6 }}>
                    <FieldLabel>Tu WhatsApp o teléfono de contacto (opcional)</FieldLabel>
                    <FieldInput
                      value={contacto}
                      onChangeText={(v) => {
                        setContacto(v);
                        setFormErr(null);
                      }}
                      placeholder="Para poder responderte más rápido"
                      keyboardType="phone-pad"
                    />
                  </View>

                  {!!formErr && (
                    <View
                      style={{
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: COLORS.dangerBorder,
                        backgroundColor: COLORS.dangerBg,
                        padding: 10,
                      }}
                    >
                      <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20 }}>
                        {formErr}
                      </Text>
                    </View>
                  )}

                  <Pressable
                    onPress={handleSubmit}
                    disabled={sending}
                    style={({ pressed }) => ({
                      opacity: sending ? 0.7 : pressed ? 0.9 : 1,
                      borderRadius: 14,
                      paddingVertical: 14,
                      alignItems: "center",
                      backgroundColor: COLORS.accent,
                      borderWidth: 1,
                      borderColor: COLORS.accentDark,
                      marginTop: 4,
                    })}
                  >
                    {sending ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <ActivityIndicator color="#FFFFFF" />
                        <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                          Enviando…
                        </Text>
                      </View>
                    ) : (
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                        Enviar Formulario
                      </Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      </View>
    </Modal>
  );
}
