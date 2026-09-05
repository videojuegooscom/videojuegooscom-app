// components/VenderAhoraModal.tsx
/**
 * Qué hace: modal ("pop") que se abre al pulsar "Vender ahora". Es el
 * formulario para clientes que quieren vender su consola/electrónica: datos
 * de contacto (nombre, apellido, edad, género), qué artículo es, si funciona
 * bien o no (con su pregunta según la respuesta), ciudad, precio esperado,
 * cómo prefieren que les contactemos y cómo se entrega el artículo. Al
 * enviarlo se guarda directamente en Supabase — no se envía ningún email.
 *
 * Cómo funciona:
 * - Ocupa el ancho completo (hasta un máximo cómodo de lectura) tanto en
 *   móvil como en escritorio, con una animación de entrada tipo "pop"
 *   (fade + spring de escala) hecha con Animated.
 * - Todos los TextInput usan fontSize 16: por debajo de 16px los navegadores
 *   móviles (Chrome/Safari) hacen zoom automático al enfocar un campo; con
 *   16px o más no lo hacen, así que al escribir la pantalla ya no salta.
 * - "¿Todo funciona perfectamente?" es un selector Sí/No. Si es Sí, pide el
 *   motivo de la venta; si es No, pide una breve descripción del problema.
 * - "Método de contacto" es un selector (WhatsApp/Gmail/Instagram/Facebook/
 *   TikTok) que cambia el campo siguiente: WhatsApp añade el prefijo "+34"
 *   fijo antes del número, Gmail ofrece autocompletar "@gmail.com" con un
 *   chip si el usuario no lo ha escrito, y las redes sociales anteponen "@"
 *   de forma fija. El método de contacto es opcional en conjunto, pero si se
 *   elige uno hay que rellenar su campo.
 * - "Opción de venta" es un selector (recogida en domicilio / el cliente se
 *   desplaza a entregarlo). Si es domicilio pide la dirección completa; si
 *   es entrega pide la disponibilidad horaria (Mañana/Medio día/Tarde
 *   noche).
 * - Nombre, apellido, género y la confirmación de ser mayor de 18 años son
 *   obligatorios.
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

// Tamaño mínimo de fuente en los campos de texto: por debajo de 16px los
// navegadores móviles hacen zoom automático al enfocar el campo.
const INPUT_FONT_SIZE = 16;

type MetodoContacto = "whatsapp" | "gmail" | "instagram" | "facebook" | "tiktok";
type OpcionVenta = "domicilio" | "entrega";
type Disponibilidad = "manana" | "mediodia" | "tardenoche";
type Genero = "masculino" | "femenino";

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
        fontSize: INPUT_FONT_SIZE,
      }}
      {...props}
    />
  );
}

// Fila fija (prefijo tipo "+34" o "@") + campo editable a su lado. Mismo
// alto y tipografía que FieldInput para que no salte el zoom del navegador.
function PrefixedInput({
  prefix,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  prefix: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <View
        style={{
          paddingHorizontal: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.card,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: INPUT_FONT_SIZE }}>
          {prefix}
        </Text>
      </View>

      <FieldInput
        style={{ flex: 1 }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize="none"
      />
    </View>
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
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 14 }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Selector genérico en forma de "pop" de chips, del mismo ancho que un
// recuadro de formulario. Se usa para método de contacto, opción de venta,
// disponibilidad y género.
function ChipChoice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => ({
              flexGrow: 1,
              minWidth: 96,
              borderRadius: 14,
              paddingVertical: 12,
              paddingHorizontal: 12,
              alignItems: "center",
              borderWidth: 1,
              borderColor: active ? COLORS.accentBorder : COLORS.border,
              backgroundColor: active ? COLORS.accent2 : COLORS.cardSoft,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 14 }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Checkbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          borderWidth: 1.5,
          borderColor: checked ? COLORS.accentDark : COLORS.border,
          backgroundColor: checked ? COLORS.accent : COLORS.cardSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
      </View>
      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 14, flex: 1, lineHeight: 19 }}>
        {label}
      </Text>
    </Pressable>
  );
}

const METODO_OPTIONS: { label: string; value: MetodoContacto }[] = [
  { label: "WhatsApp", value: "whatsapp" },
  { label: "Gmail", value: "gmail" },
  { label: "Instagram", value: "instagram" },
  { label: "Facebook", value: "facebook" },
  { label: "TikTok", value: "tiktok" },
];

const OPCION_VENTA_OPTIONS: { label: string; value: OpcionVenta }[] = [
  { label: "Quiero que lo recojan en mi domicilio", value: "domicilio" },
  { label: "Me desplazo a entregarlo", value: "entrega" },
];

const DISPONIBILIDAD_OPTIONS: { label: string; value: Disponibilidad }[] = [
  { label: "Mañana", value: "manana" },
  { label: "Medio día", value: "mediodia" },
  { label: "Tarde noche", value: "tardenoche" },
];

const GENERO_OPTIONS: { label: string; value: Genero }[] = [
  { label: "Masculino", value: "masculino" },
  { label: "Femenino", value: "femenino" },
];

type SellRequestPayload = {
  nombre: string;
  apellido: string;
  articulo: string;
  funciona_bien: boolean;
  motivo_venta: string | null;
  descripcion_problema: string | null;
  ciudad: string;
  precio_estimado: string;
  metodo_contacto: MetodoContacto | null;
  contacto: string | null;
  opcion_venta: OpcionVenta;
  direccion: string | null;
  disponibilidad: Disponibilidad | null;
  mayor_edad: boolean;
  genero: Genero;
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

  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");

  const [articulo, setArticulo] = useState("");
  const [funcionaBien, setFuncionaBien] = useState<boolean | null>(null);
  const [motivoVenta, setMotivoVenta] = useState("");
  const [descripcionProblema, setDescripcionProblema] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [precioEstimado, setPrecioEstimado] = useState("");

  const [metodoContacto, setMetodoContacto] = useState<MetodoContacto | null>(null);
  const [contactoValor, setContactoValor] = useState("");

  const [opcionVenta, setOpcionVenta] = useState<OpcionVenta | null>(null);
  const [direccion, setDireccion] = useState("");
  const [disponibilidad, setDisponibilidad] = useState<Disponibilidad | null>(null);

  const [mayorEdad, setMayorEdad] = useState(false);
  const [genero, setGenero] = useState<Genero | null>(null);

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
    setNombre("");
    setApellido("");
    setArticulo("");
    setFuncionaBien(null);
    setMotivoVenta("");
    setDescripcionProblema("");
    setCiudad("");
    setPrecioEstimado("");
    setMetodoContacto(null);
    setContactoValor("");
    setOpcionVenta(null);
    setDireccion("");
    setDisponibilidad(null);
    setMayorEdad(false);
    setGenero(null);
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

  function buildContacto(): string | null {
    if (!metodoContacto) return null;
    const raw = contactoValor.trim();
    if (!raw) return null;

    if (metodoContacto === "whatsapp") {
      const digits = raw.replace(/[^\d]/g, "");
      return digits ? `+34 ${digits}` : null;
    }

    if (metodoContacto === "gmail") {
      return raw.includes("@") ? raw : `${raw}@gmail.com`;
    }

    // instagram / facebook / tiktok
    const handle = raw.replace(/^@+/, "");
    return handle ? `@${handle}` : null;
  }

  async function handleSubmit() {
    if (sending) return;

    const cleanNombre = nombre.trim();
    const cleanApellido = apellido.trim();
    const cleanArticulo = articulo.trim();
    const cleanCiudad = ciudad.trim();
    const cleanPrecio = precioEstimado.trim();
    const cleanMotivo = motivoVenta.trim();
    const cleanProblema = descripcionProblema.trim();
    const cleanDireccion = direccion.trim();

    if (!cleanNombre) {
      setFormErr("Indica tu nombre.");
      return;
    }

    if (!cleanApellido) {
      setFormErr("Indica tu apellido.");
      return;
    }

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

    if (metodoContacto && !contactoValor.trim()) {
      setFormErr("Completa tu dato de contacto o quita el método elegido.");
      return;
    }

    if (!opcionVenta) {
      setFormErr("Indica cómo prefieres entregar el artículo.");
      return;
    }

    if (opcionVenta === "domicilio" && !cleanDireccion) {
      setFormErr("Indica tu dirección completa (calle, número, puerta y letra).");
      return;
    }

    if (opcionVenta === "entrega" && !disponibilidad) {
      setFormErr("Indica tu disponibilidad para entregarlo.");
      return;
    }

    if (!genero) {
      setFormErr("Indica tu género.");
      return;
    }

    if (!mayorEdad) {
      setFormErr("Debes confirmar que eres mayor de 18 años para continuar.");
      return;
    }

    setFormErr(null);
    setSending(true);

    const payload: SellRequestPayload = {
      nombre: cleanNombre,
      apellido: cleanApellido,
      articulo: cleanArticulo,
      funciona_bien: funcionaBien,
      motivo_venta: funcionaBien ? cleanMotivo : null,
      descripcion_problema: !funcionaBien ? cleanProblema : null,
      ciudad: cleanCiudad,
      precio_estimado: cleanPrecio,
      metodo_contacto: metodoContacto,
      contacto: buildContacto(),
      opcion_venta: opcionVenta,
      direccion: opcionVenta === "domicilio" ? cleanDireccion : null,
      disponibilidad: opcionVenta === "entrega" ? disponibilidad : null,
      mayor_edad: mayorEdad,
      genero,
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

  const showGmailHint = metodoContacto === "gmail" && !contactoValor.includes("@");

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

                  <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>
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

                  <View style={{ flexDirection: isMobile ? "column" : "row", gap: 10 }}>
                    <View style={{ flex: 1, gap: 6 }}>
                      <FieldLabel>Nombre</FieldLabel>
                      <FieldInput
                        value={nombre}
                        onChangeText={(v) => {
                          setNombre(v);
                          setFormErr(null);
                        }}
                        placeholder="Tu nombre"
                      />
                    </View>
                    <View style={{ flex: 1, gap: 6 }}>
                      <FieldLabel>Apellido</FieldLabel>
                      <FieldInput
                        value={apellido}
                        onChangeText={(v) => {
                          setApellido(v);
                          setFormErr(null);
                        }}
                        placeholder="Tu apellido"
                      />
                    </View>
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
                    <FieldLabel>¿Cómo prefieres que te contactemos? (opcional)</FieldLabel>
                    <ChipChoice
                      options={METODO_OPTIONS}
                      value={metodoContacto}
                      onChange={(v) => {
                        setMetodoContacto(v);
                        setContactoValor("");
                        setFormErr(null);
                      }}
                    />
                  </View>

                  {metodoContacto === "whatsapp" && (
                    <View style={{ gap: 6 }}>
                      <FieldLabel>Tu número de WhatsApp</FieldLabel>
                      <PrefixedInput
                        prefix="+34"
                        value={contactoValor}
                        onChangeText={(v) => {
                          setContactoValor(v);
                          setFormErr(null);
                        }}
                        placeholder="612 345 678"
                        keyboardType="phone-pad"
                      />
                    </View>
                  )}

                  {metodoContacto === "gmail" && (
                    <View style={{ gap: 6 }}>
                      <FieldLabel>Tu email de Gmail</FieldLabel>
                      <FieldInput
                        value={contactoValor}
                        onChangeText={(v) => {
                          setContactoValor(v);
                          setFormErr(null);
                        }}
                        placeholder="tunombre@gmail.com"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {showGmailHint && (
                        <Pressable
                          onPress={() =>
                            setContactoValor((v) => (v.includes("@") ? v : `${v}@gmail.com`))
                          }
                          style={({ pressed }) => ({
                            alignSelf: "flex-start",
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: COLORS.accentBorder,
                            backgroundColor: COLORS.accent2,
                            opacity: pressed ? 0.85 : 1,
                          })}
                        >
                          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                            + Añadir @gmail.com
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  )}

                  {(metodoContacto === "instagram" ||
                    metodoContacto === "facebook" ||
                    metodoContacto === "tiktok") && (
                    <View style={{ gap: 6 }}>
                      <FieldLabel>Tu usuario de {METODO_OPTIONS.find((m) => m.value === metodoContacto)?.label}</FieldLabel>
                      <PrefixedInput
                        prefix="@"
                        value={contactoValor}
                        onChangeText={(v) => {
                          setContactoValor(v);
                          setFormErr(null);
                        }}
                        placeholder="tu.usuario"
                      />
                    </View>
                  )}

                  <View style={{ gap: 6 }}>
                    <FieldLabel>Opción de venta</FieldLabel>
                    <ChipChoice
                      options={OPCION_VENTA_OPTIONS}
                      value={opcionVenta}
                      onChange={(v) => {
                        setOpcionVenta(v);
                        setFormErr(null);
                      }}
                    />
                  </View>

                  {opcionVenta === "domicilio" && (
                    <View style={{ gap: 6 }}>
                      <FieldLabel>Dirección completa</FieldLabel>
                      <FieldInput
                        value={direccion}
                        onChangeText={(v) => {
                          setDireccion(v);
                          setFormErr(null);
                        }}
                        placeholder="Calle, número, puerta y letra"
                        multiline
                      />
                    </View>
                  )}

                  {opcionVenta === "entrega" && (
                    <View style={{ gap: 6 }}>
                      <FieldLabel>Disponibilidad diaria</FieldLabel>
                      <ChipChoice
                        options={DISPONIBILIDAD_OPTIONS}
                        value={disponibilidad}
                        onChange={(v) => {
                          setDisponibilidad(v);
                          setFormErr(null);
                        }}
                      />
                    </View>
                  )}

                  <View style={{ gap: 6 }}>
                    <FieldLabel>Género</FieldLabel>
                    <ChipChoice
                      options={GENERO_OPTIONS}
                      value={genero}
                      onChange={(v) => {
                        setGenero(v);
                        setFormErr(null);
                      }}
                    />
                  </View>

                  <Checkbox
                    checked={mayorEdad}
                    onToggle={() => {
                      setMayorEdad((v) => !v);
                      setFormErr(null);
                    }}
                    label="Confirmo que soy mayor de 18 años"
                  />

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
