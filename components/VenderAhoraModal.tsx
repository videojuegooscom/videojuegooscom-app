// components/VenderAhoraModal.tsx
/**
 * Qué hace: modal ("pop") que se abre al pulsar "Vender ahora". Es el
 * formulario para clientes que quieren vender su consola/electrónica: datos
 * de contacto (nombre, apellido, género), qué artículo es, si funciona bien
 * o no (con su pregunta según la respuesta), ciudad, precio esperado, cómo
 * prefieren que les contactemos y cómo se entrega el artículo. Al enviarlo
 * se guarda directamente en Supabase — no se envía ningún email.
 *
 * Cómo funciona:
 * - Ocupa el ancho completo (hasta un máximo cómodo de lectura) tanto en
 *   móvil como en escritorio, con una animación de entrada tipo "pop"
 *   (fade + spring de escala) hecha con Animated.
 * - Responsive: en móvil todo va en una sola columna a ancho completo. A
 *   partir de tablet/escritorio (ancho >= 700) el modal crece hasta un
 *   máximo mayor y varios campos se colocan en pareja (Nombre/Apellido,
 *   Ciudad/Precio, selector+campo condicional de contacto y de entrega)
 *   para aprovechar el ancho sin que el formulario se vea como una columna
 *   interminable.
 * - Todo el texto (títulos, subtítulos, preguntas/labels, botones y chips)
 *   va centrado para que se vea más cuidado; lo único que NO se centra es
 *   lo que el usuario escribe dentro de los campos de texto, que siempre
 *   empieza por la izquierda como es normal al escribir.
 * - En móvil los espaciados y tamaños son un poco más ajustados (paddings
 *   menores, título algo más pequeño) para una sensación más "premium" y
 *   menos apretada; los TextInput mantienen fontSize 16 siempre — por
 *   debajo de 16px los navegadores móviles hacen zoom automático al
 *   enfocar el campo, así que no se puede reducir sin que vuelva ese salto.
 * - Cada pregunta de "elegir una opción" (Sí/No, género, método de
 *   contacto, opción de venta, disponibilidad) usa SelectField: un botón
 *   compacto "Elegir" con un icono de flecha (Ionicons chevron, no un
 *   emoji) que al tocarlo despliega justo debajo las opciones en forma de
 *   chips; al elegir una, el botón pasa a mostrar el valor elegido y se
 *   pliega otra vez.
 * - Todos los botones y desplegables (SelectField y sus chips, la casilla
 *   de mayor de edad, el chip de "+ Añadir @gmail.com", la X de cerrar, el
 *   botón "Cerrar" final y el propio botón de enviar) tienen una pequeña
 *   animación "pop" tipo Apple al pulsarlos: se encogen levemente
 *   (Animated.spring) al tocar y vuelven a su tamaño al soltar, usando el
 *   componente AnimatedPressable definido más abajo.
 * - Cada campo (de texto o de elegir una opción) baja de intensidad de
 *   color y muestra una marca de verificación en verde (Ionicons
 *   checkmark-circle, no un emoji) en cuanto tiene un valor válido y no se
 *   está editando en ese momento. Al volver a tocarlo para corregirlo
 *   recupera su color normal; al salir de él (tocar otro campo, o elegir
 *   una opción y cerrarse el desplegable) vuelve a atenuarse si sigue
 *   siendo válido. Los campos que aún están vacíos se quedan como estaban.
 *   La pregunta (FieldLabel) de cada campo también se atenúa a la vez que
 *   su campo, vía la prop "dim".
 * - Nombre, apellido y el dato de contacto (teléfono/email/usuario, según
 *   el método elegido) piden un mínimo de caracteres para evitar datos
 *   claramente incompletos o erróneos; el resto de campos solo exige que
 *   no estén vacíos, como hasta ahora.
 * - "¿Todo funciona perfectamente?" (Sí/No). Si es Sí, pide el motivo de la
 *   venta; si es No, pide una breve descripción del problema.
 * - "Método de contacto" (WhatsApp/Gmail/Instagram/Facebook/TikTok) cambia
 *   el campo siguiente: WhatsApp añade el prefijo "+34" fijo antes del
 *   número, Gmail ofrece autocompletar "@gmail.com" con un chip si el
 *   usuario no lo ha escrito, y las redes sociales anteponen "@" de forma
 *   fija. Es obligatorio elegir un método y rellenar su dato de contacto:
 *   sin eso no hay forma de contactar al cliente y el formulario no sirve.
 * - "Opción de venta" (recogida en domicilio / el cliente se desplaza a
 *   entregarlo). Si es domicilio pide la dirección completa; si es entrega
 *   pide la disponibilidad horaria (Mañana/Medio día/Tarde noche).
 * - El botón final es un progreso animado: se calculan 13 pasos
 *   obligatorios (nombre, apellido, género, artículo, funciona/no,
 *   motivo-o-problema según corresponda, ciudad, precio, método de
 *   contacto y su dato, opción de venta, dirección-o-disponibilidad según
 *   corresponda, y confirmar mayoría de edad). El botón se rellena de
 *   color (con transición animada) según el % completado, se ve
 *   apagado/desactivado por debajo del 100% y solo se puede pulsar
 *   exactamente al llegar al 100%; mientras tanto muestra debajo del texto
 *   "Enviar Formulario" un "XX% completado".
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
import React, { useEffect, useMemo, useRef, useState } from "react";
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

// Tamaño mínimo de fuente en los campos de texto: por debajo de 16px los
// navegadores móviles hacen zoom automático al enfocar el campo.
const INPUT_FONT_SIZE = 16;

type MetodoContacto = "whatsapp" | "gmail" | "instagram" | "facebook" | "tiktok";
type OpcionVenta = "domicilio" | "entrega";
type Disponibilidad = "manana" | "mediodia" | "tardenoche";
type Genero = "masculino" | "femenino";

// Contexto ligero solo para saber si estamos en móvil, y así los
// subcomponentes (definidos fuera del componente principal) puedan ajustar
// tamaños/paddings sin tener que recibir la prop en cada uso.
const IsMobileContext = React.createContext(false);
function useIsMobile() {
  return React.useContext(IsMobileContext);
}

// Envoltorio de Pressable con una pequeña animación "pop" tipo Apple: al
// pulsar se encoge levemente (Animated.spring) y al soltar vuelve a su
// tamaño normal. Se reparte en dos capas para no romper el posicionamiento
// de los botones que usan position:"absolute" (como la X de cerrar): el
// Pressable exterior lleva SOLO tamaño/posición (containerStyle) y el
// Animated.View interior lleva todo lo visual (color, borde, padding...) y
// es el que realmente se anima. style/children admiten función, igual que
// el Pressable normal de React Native, para poder usar el estado "pressed".
function AnimatedPressable({
  onPress,
  disabled,
  containerStyle,
  style,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  containerStyle?: any;
  style?: any | ((state: { pressed: boolean }) => any);
  children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

  function onPressIn() {
    setPressed(true);
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  }

  function onPressOut() {
    setPressed(false);
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  }

  const resolvedStyle = typeof style === "function" ? style({ pressed }) : style;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={containerStyle}
    >
      <Animated.View style={[resolvedStyle, { transform: [{ scale }] }]}>
        {typeof children === "function" ? children({ pressed }) : children}
      </Animated.View>
    </Pressable>
  );
}

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

// dim=true atenúa también la pregunta (no solo el campo/desplegable de
// debajo) cuando ese campo ya está completo, siguiendo el mismo lenguaje
// visual de "completado" que FieldInput/SelectField.
function FieldLabel({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  const isMobile = useIsMobile();
  return (
    <Text
      style={{
        color: dim ? COLORS.muted : COLORS.text,
        fontWeight: "900",
        fontSize: isMobile ? 13 : 14,
        lineHeight: isMobile ? 18 : 19,
        textAlign: "center",
      }}
    >
      {children}
    </Text>
  );
}

// Campo de texto con "estado de completado": cuando tiene un valor válido
// (filled=true) y no se está escribiendo en él ahora mismo, baja de
// intensidad (borde/fondo/texto más suaves) y muestra un check verde a la
// derecha; al tocarlo para corregirlo (onFocus) recupera su aspecto normal
// de inmediato, y al salir (onBlur) se vuelve a atenuar si sigue siendo
// válido. containerStyle es para el diseño del contenedor exterior (p.ej.
// flex:1 dentro de una fila); style sigue afectando solo al TextInput.
function FieldInput({
  filled,
  containerStyle,
  style,
  onFocus,
  onBlur,
  ...rest
}: React.ComponentProps<typeof TextInput> & { filled?: boolean; containerStyle?: any }) {
  const isMobile = useIsMobile();
  const [focused, setFocused] = useState(false);
  const completed = !!filled && !focused;

  return (
    <View style={[{ justifyContent: "center" }, containerStyle]}>
      <TextInput
        placeholderTextColor="rgba(11,33,56,0.40)"
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 14,
            paddingHorizontal: isMobile ? 11 : 12,
            paddingRight: completed ? (isMobile ? 34 : 38) : isMobile ? 11 : 12,
            paddingVertical: isMobile ? 10 : 12,
            color: completed ? COLORS.muted : COLORS.text,
            backgroundColor: completed ? COLORS.card : COLORS.cardSoft,
            fontSize: INPUT_FONT_SIZE,
            textAlign: "left",
          },
          style,
        ]}
        {...rest}
      />
      {completed && (
        <View style={{ position: "absolute", right: isMobile ? 10 : 12, top: isMobile ? 10 : 12 }}>
          <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
        </View>
      )}
    </View>
  );
}

// Fila fija (prefijo tipo "+34" o "@") + campo editable a su lado. Mismo
// alto y tipografía que FieldInput para que no salte el zoom del navegador.
// El texto que escribe el usuario sigue alineado a la izquierda a propósito.
function PrefixedInput({
  prefix,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  filled,
}: {
  prefix: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];
  filled?: boolean;
}) {
  const isMobile = useIsMobile();
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <View
        style={{
          paddingHorizontal: isMobile ? 12 : 14,
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
        containerStyle={{ flex: 1 }}
        filled={filled}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize="none"
      />
    </View>
  );
}

// Selector "Elegir ⌄": un botón compacto y centrado que muestra el valor
// elegido (o "Elegir" con un icono de flecha si no hay nada elegido
// todavía) y, al tocarlo, despliega justo debajo las opciones en forma de
// chips. Al elegir una se pliega de nuevo. compact=true lo deja con un
// ancho contenido (para no estirarse una fila entera en pantallas anchas);
// compact=false lo estira al 100% del contenedor (para cuando ya va dentro
// de una columna de una fila de dos).
function SelectField<T extends string>({
  options,
  value,
  onChange,
  compact,
}: {
  options: { label: string; value: T }[];
  value: T | null;
  onChange: (v: T) => void;
  compact?: boolean;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  // "Completado": ya hay un valor elegido y el desplegable está cerrado. En
  // ese caso el botón baja de intensidad y muestra un check en vez de la
  // flecha; al volver a tocarlo (se abre) recupera el aspecto normal para
  // poder corregir la elección.
  const completed = !!value && !open;

  return (
    <View style={{ gap: 8, alignItems: compact ? "center" : "stretch" }}>
      <AnimatedPressable
        onPress={() => setOpen((o) => !o)}
        containerStyle={{
          alignSelf: compact ? "center" : "stretch",
          width: compact ? undefined : "100%",
          minWidth: compact ? 180 : undefined,
          maxWidth: compact ? 340 : undefined,
        }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: completed ? COLORS.border : value ? COLORS.accentBorder : COLORS.border,
          backgroundColor: completed ? COLORS.card : value ? COLORS.accent2 : COLORS.cardSoft,
          paddingVertical: isMobile ? 10 : 12,
          paddingHorizontal: isMobile ? 12 : 14,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Text
          numberOfLines={1}
          style={{
            color: completed ? COLORS.muted : COLORS.text,
            fontWeight: "900",
            fontSize: INPUT_FONT_SIZE,
            flexShrink: 1,
            textAlign: "center",
          }}
        >
          {selected ? selected.label : "Elegir"}
        </Text>
        {completed ? (
          <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
        ) : (
          <Ionicons
            name={open ? "chevron-up-outline" : "chevron-down-outline"}
            size={18}
            color={COLORS.text}
          />
        )}
      </AnimatedPressable>

      {open && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
          {options.map((opt) => {
            const active = value === opt.value;
            return (
              <AnimatedPressable
                key={opt.value}
                onPress={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                containerStyle={{ flexGrow: 1, minWidth: 96 }}
                style={({ pressed }) => ({
                  borderRadius: 14,
                  paddingVertical: isMobile ? 10 : 12,
                  paddingHorizontal: 12,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: active ? COLORS.accentBorder : COLORS.border,
                  backgroundColor: active ? COLORS.accent2 : COLORS.cardSoft,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 14, textAlign: "center" }}>
                  {opt.label}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// Igual que SelectField pero para la pregunta Sí/No (funcionaBien es
// boolean, no un string), reutilizando el mismo botón "Elegir".
function YesNoSelect({
  value,
  onChange,
  compact,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  compact?: boolean;
}) {
  const mapped: "si" | "no" | null = value === null ? null : value ? "si" : "no";
  return (
    <SelectField
      options={[
        { label: "Sí", value: "si" as const },
        { label: "No", value: "no" as const },
      ]}
      value={mapped}
      onChange={(v) => onChange(v === "si")}
      compact={compact}
    />
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
  const isMobile = useIsMobile();
  const boxSize = isMobile ? 22 : 24;
  return (
    <View style={{ alignItems: "center" }}>
      <AnimatedPressable
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
            width: boxSize,
            height: boxSize,
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
        <Text
          style={{
            color: COLORS.text,
            fontWeight: "800",
            fontSize: isMobile ? 13 : 14,
            lineHeight: 19,
          }}
        >
          {label}
        </Text>
      </AnimatedPressable>
    </View>
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

// Valida el dato de contacto según el método elegido, con un mínimo de
// caracteres para evitar datos claramente incompletos: un número de
// WhatsApp necesita al menos 9 dígitos (como un móvil español sin el
// prefijo "+34"), un email de Gmail necesita al menos 3 caracteres antes
// de la "@", y un usuario de red social al menos 2 caracteres sin contar
// el "@" inicial.
function contactoEsValido(metodo: MetodoContacto | null, valor: string): boolean {
  const raw = valor.trim();
  if (!metodo || !raw) return false;

  if (metodo === "whatsapp") {
    return raw.replace(/[^\d]/g, "").length >= 9;
  }

  if (metodo === "gmail") {
    return raw.split("@")[0].trim().length >= 3;
  }

  // instagram / facebook / tiktok
  return raw.replace(/^@+/, "").trim().length >= 2;
}

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
  const isDesktopish = widthSafe >= 1024;
  // A partir de tablet/escritorio se usan parejas de campos en fila.
  const twoCol = !isMobile;
  // El modal crece en pantallas anchas para aprovechar mejor el ancho.
  const modalMaxWidth = isDesktopish ? 860 : isMobile ? 640 : 720;

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

  // Validez "reforzada" (con mínimo de caracteres) para nombre, apellido y
  // dato de contacto — se usan tanto para el check verde/atenuado de cada
  // campo como para el progreso y la validación al enviar. El resto de
  // campos solo exige que no estén vacíos, como hasta ahora.
  const nombreValido = nombre.trim().length >= 2;
  const apellidoValido = apellido.trim().length >= 2;
  const contactoValido = contactoEsValido(metodoContacto, contactoValor);

  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  // Escala "pop" del botón de enviar. Es un caso especial: el botón tiene
  // capas de fondo (pista + relleno de progreso) que van por fuera del
  // Pressable interior, así que la animación de escala se aplica al
  // Animated.View exterior que envuelve todas esas capas, mientras que
  // quien dispara el press-in/press-out sigue siendo el Pressable interior.
  const submitScale = useRef(new Animated.Value(1)).current;

  function submitPressIn() {
    Animated.spring(submitScale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  }

  function submitPressOut() {
    Animated.spring(submitScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  }

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

  // Progreso del formulario: 13 pasos obligatorios con el mismo peso cada
  // uno (el método de contacto y su dato cuentan como obligatorios: sin
  // forma de contactar al cliente el formulario no sirve). El botón de
  // enviar solo se activa al llegar exactamente al 100%.
  const progress = useMemo(() => {
    const steps: boolean[] = [
      nombreValido,
      apellidoValido,
      !!genero,
      !!articulo.trim(),
      funcionaBien !== null,
      funcionaBien === true
        ? !!motivoVenta.trim()
        : funcionaBien === false
          ? !!descripcionProblema.trim()
          : false,
      !!ciudad.trim(),
      !!precioEstimado.trim(),
      !!metodoContacto,
      contactoValido,
      !!opcionVenta,
      opcionVenta === "domicilio"
        ? !!direccion.trim()
        : opcionVenta === "entrega"
          ? !!disponibilidad
          : false,
      mayorEdad,
    ];

    const total = steps.length;
    const completed = steps.filter(Boolean).length;
    const percent = Math.round((completed / total) * 100);

    return { percent, canSubmit: completed === total };
  }, [
    nombreValido,
    apellidoValido,
    genero,
    articulo,
    funcionaBien,
    motivoVenta,
    descripcionProblema,
    ciudad,
    precioEstimado,
    metodoContacto,
    contactoValido,
    opcionVenta,
    direccion,
    disponibilidad,
    mayorEdad,
  ]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress.percent,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [progress.percent, progressAnim]);

  const fillWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });
  const buttonOpacity = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: [0.55, 1],
  });

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
    if (sending || !progress.canSubmit) return;

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

    if (!nombreValido) {
      setFormErr("Tu nombre es demasiado corto.");
      return;
    }

    if (!cleanApellido) {
      setFormErr("Indica tu apellido.");
      return;
    }

    if (!apellidoValido) {
      setFormErr("Tu apellido es demasiado corto.");
      return;
    }

    if (!genero) {
      setFormErr("Indica tu género.");
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

    if (!metodoContacto) {
      setFormErr("Indica cómo prefieres que te contactemos.");
      return;
    }

    if (!contactoValor.trim()) {
      setFormErr("Completa tu dato de contacto.");
      return;
    }

    if (!contactoValido) {
      setFormErr("Revisa tu dato de contacto: parece incompleto.");
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
    <IsMobileContext.Provider value={isMobile}>
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
                width: "100%",
                maxWidth: modalMaxWidth,
                alignSelf: "center",
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
                  padding: isMobile ? 14 : 22,
                  gap: isMobile ? 12 : 14,
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

                    <AnimatedPressable
                      onPress={handleClose}
                      containerStyle={{ marginTop: 4 }}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.9 : 1,
                        borderRadius: 999,
                        paddingVertical: 12,
                        paddingHorizontal: 20,
                        backgroundColor: COLORS.accent,
                      })}
                    >
                      <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Cerrar</Text>
                    </AnimatedPressable>
                  </View>
                ) : (
                  <>
                    <AnimatedPressable
                      onPress={handleClose}
                      containerStyle={{
                        position: "absolute",
                        top: isMobile ? 12 : 16,
                        right: isMobile ? 12 : 16,
                        zIndex: 2,
                        width: 32,
                        height: 32,
                      }}
                      style={({ pressed }) => ({
                        flex: 1,
                        opacity: pressed ? 0.8 : 1,
                        borderRadius: 16,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: COLORS.card,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                      })}
                    >
                      <Ionicons name="close" size={18} color={COLORS.text} />
                    </AnimatedPressable>

                    <View style={{ alignItems: "center", paddingHorizontal: 34 }}>
                      <Text
                        style={{
                          color: COLORS.text,
                          fontSize: isMobile ? 18 : 21,
                          fontWeight: "900",
                          lineHeight: isMobile ? 24 : 26,
                          textAlign: "center",
                        }}
                      >
                        Vender mi artículo
                      </Text>
                      <Text
                        style={{
                          color: COLORS.muted,
                          marginTop: 4,
                          lineHeight: 20,
                          textAlign: "center",
                        }}
                      >
                        Cuéntanos lo básico y te contactamos con una propuesta.
                      </Text>
                    </View>

                    {/* Nombre + Apellido */}
                    <View style={{ flexDirection: twoCol ? "row" : "column", gap: isMobile ? 12 : 14 }}>
                      <View style={{ flex: 1, gap: 6 }}>
                        <FieldLabel dim={nombreValido}>Nombre</FieldLabel>
                        <FieldInput
                          value={nombre}
                          onChangeText={(v) => {
                            setNombre(v);
                            setFormErr(null);
                          }}
                          placeholder="Tu nombre"
                          filled={nombreValido}
                        />
                      </View>
                      <View style={{ flex: 1, gap: 6 }}>
                        <FieldLabel dim={apellidoValido}>Apellido</FieldLabel>
                        <FieldInput
                          value={apellido}
                          onChangeText={(v) => {
                            setApellido(v);
                            setFormErr(null);
                          }}
                          placeholder="Tu apellido"
                          filled={apellidoValido}
                        />
                      </View>
                    </View>

                    {/* Género, justo debajo de Nombre y Apellido */}
                    <View style={{ gap: 6 }}>
                      <FieldLabel dim={!!genero}>Género</FieldLabel>
                      <SelectField
                        options={GENERO_OPTIONS}
                        value={genero}
                        onChange={(v) => {
                          setGenero(v);
                          setFormErr(null);
                        }}
                        compact={twoCol}
                      />
                    </View>

                    <View style={{ gap: 6 }}>
                      <FieldLabel dim={!!articulo.trim()}>¿Qué artículo de electrónica o relacionado quieres vender?</FieldLabel>
                      <FieldInput
                        value={articulo}
                        onChangeText={(v) => {
                          setArticulo(v);
                          setFormErr(null);
                        }}
                        placeholder="Ej: PlayStation 5 con dos mandos"
                        multiline
                        filled={!!articulo.trim()}
                      />
                    </View>

                    <View style={{ gap: 6 }}>
                      <FieldLabel dim={funcionaBien !== null}>¿Todo funciona perfectamente?</FieldLabel>
                      <YesNoSelect
                        value={funcionaBien}
                        onChange={(v) => {
                          setFuncionaBien(v);
                          setFormErr(null);
                        }}
                        compact={twoCol}
                      />
                    </View>

                    {funcionaBien === true && (
                      <View style={{ gap: 6 }}>
                        <FieldLabel dim={!!motivoVenta.trim()}>¿Cuál es el motivo de la venta?</FieldLabel>
                        <FieldInput
                          value={motivoVenta}
                          onChangeText={(v) => {
                            setMotivoVenta(v);
                            setFormErr(null);
                          }}
                          placeholder="Ej: ya no lo uso, cambio de consola..."
                          multiline
                          filled={!!motivoVenta.trim()}
                        />
                      </View>
                    )}

                    {funcionaBien === false && (
                      <View style={{ gap: 6 }}>
                        <FieldLabel dim={!!descripcionProblema.trim()}>
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
                          filled={!!descripcionProblema.trim()}
                        />
                      </View>
                    )}

                    {/* Ciudad + Precio estimado */}
                    <View style={{ flexDirection: twoCol ? "row" : "column", gap: isMobile ? 12 : 14 }}>
                      <View style={{ flex: 1, gap: 6 }}>
                        <FieldLabel dim={!!ciudad.trim()}>¿En qué ciudad te encuentras?</FieldLabel>
                        <FieldInput
                          value={ciudad}
                          onChangeText={(v) => {
                            setCiudad(v);
                            setFormErr(null);
                          }}
                          placeholder="Ej: Zaragoza"
                          filled={!!ciudad.trim()}
                        />
                      </View>
                      <View style={{ flex: 1, gap: 6 }}>
                        <FieldLabel dim={!!precioEstimado.trim()}>¿Cuánto estimas recibir por tu artículo?</FieldLabel>
                        <FieldInput
                          value={precioEstimado}
                          onChangeText={(v) => {
                            setPrecioEstimado(v);
                            setFormErr(null);
                          }}
                          placeholder="Ej: 150€"
                          filled={!!precioEstimado.trim()}
                        />
                      </View>
                    </View>

                    {/* Método de contacto + su campo condicional en pareja cuando hay uno elegido */}
                    <View
                      style={{
                        flexDirection: twoCol && metodoContacto ? "row" : "column",
                        gap: isMobile ? 12 : 14,
                        alignItems: "flex-start",
                      }}
                    >
                      <View
                        style={{
                          flex: metodoContacto ? 1 : undefined,
                          width: metodoContacto ? undefined : "100%",
                          gap: 6,
                        }}
                      >
                        <FieldLabel dim={!!metodoContacto}>¿Cómo prefieres que te contactemos?</FieldLabel>
                        <SelectField
                          options={METODO_OPTIONS}
                          value={metodoContacto}
                          onChange={(v) => {
                            setMetodoContacto(v);
                            setContactoValor("");
                            setFormErr(null);
                          }}
                          compact={twoCol && !metodoContacto}
                        />
                      </View>

                      {metodoContacto === "whatsapp" && (
                        <View style={{ flex: 1, gap: 6 }}>
                          <FieldLabel dim={contactoValido}>Tu número de WhatsApp</FieldLabel>
                          <PrefixedInput
                            prefix="+34"
                            value={contactoValor}
                            onChangeText={(v) => {
                              setContactoValor(v);
                              setFormErr(null);
                            }}
                            placeholder="612 345 678"
                            keyboardType="phone-pad"
                            filled={contactoValido}
                          />
                        </View>
                      )}

                      {metodoContacto === "gmail" && (
                        <View style={{ flex: 1, gap: 6 }}>
                          <FieldLabel dim={contactoValido}>Tu email de Gmail</FieldLabel>
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
                            filled={contactoValido}
                          />
                          {showGmailHint && (
                            <AnimatedPressable
                              onPress={() =>
                                setContactoValor((v) => (v.includes("@") ? v : `${v}@gmail.com`))
                              }
                              containerStyle={{ alignSelf: "center" }}
                              style={({ pressed }) => ({
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
                            </AnimatedPressable>
                          )}
                        </View>
                      )}

                      {(metodoContacto === "instagram" ||
                        metodoContacto === "facebook" ||
                        metodoContacto === "tiktok") && (
                        <View style={{ flex: 1, gap: 6 }}>
                          <FieldLabel dim={contactoValido}>
                            Tu usuario de {METODO_OPTIONS.find((m) => m.value === metodoContacto)?.label}
                          </FieldLabel>
                          <PrefixedInput
                            prefix="@"
                            value={contactoValor}
                            onChangeText={(v) => {
                              setContactoValor(v);
                              setFormErr(null);
                            }}
                            placeholder="tu.usuario"
                            filled={contactoValido}
                          />
                        </View>
                      )}
                    </View>

                    {/* Opción de venta + su campo condicional en pareja cuando hay una elegida */}
                    <View
                      style={{
                        flexDirection: twoCol && opcionVenta ? "row" : "column",
                        gap: isMobile ? 12 : 14,
                        alignItems: "flex-start",
                      }}
                    >
                      <View
                        style={{
                          flex: opcionVenta ? 1 : undefined,
                          width: opcionVenta ? undefined : "100%",
                          gap: 6,
                        }}
                      >
                        <FieldLabel dim={!!opcionVenta}>Opción de venta</FieldLabel>
                        <SelectField
                          options={OPCION_VENTA_OPTIONS}
                          value={opcionVenta}
                          onChange={(v) => {
                            setOpcionVenta(v);
                            setFormErr(null);
                          }}
                          compact={twoCol && !opcionVenta}
                        />
                      </View>

                      {opcionVenta === "domicilio" && (
                        <View style={{ flex: 1, gap: 6 }}>
                          <FieldLabel dim={!!direccion.trim()}>Dirección completa</FieldLabel>
                          <FieldInput
                            value={direccion}
                            onChangeText={(v) => {
                              setDireccion(v);
                              setFormErr(null);
                            }}
                            placeholder="Calle, número, puerta y letra"
                            multiline
                            filled={!!direccion.trim()}
                          />
                        </View>
                      )}

                      {opcionVenta === "entrega" && (
                        <View style={{ flex: 1, gap: 6 }}>
                          <FieldLabel dim={!!disponibilidad}>Disponibilidad diaria</FieldLabel>
                          <SelectField
                            options={DISPONIBILIDAD_OPTIONS}
                            value={disponibilidad}
                            onChange={(v) => {
                              setDisponibilidad(v);
                              setFormErr(null);
                            }}
                          />
                        </View>
                      )}
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
                        <Text
                          style={{
                            color: COLORS.danger,
                            fontWeight: "800",
                            lineHeight: 20,
                            textAlign: "center",
                          }}
                        >
                          {formErr}
                        </Text>
                      </View>
                    )}

                    {/* Botón de enviar: se rellena de color según el % completado y solo
                        se puede pulsar al llegar al 100%. */}
                    <Animated.View
                      style={{
                        opacity: buttonOpacity,
                        borderRadius: 14,
                        overflow: "hidden",
                        borderWidth: 1,
                        borderColor: COLORS.accentDark,
                        marginTop: 4,
                        transform: [{ scale: submitScale }],
                      }}
                    >
                      <View
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: COLORS.accentDark,
                        }}
                      />
                      <Animated.View
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          bottom: 0,
                          width: fillWidth,
                          backgroundColor: COLORS.accent,
                        }}
                      />

                      <Pressable
                        onPress={handleSubmit}
                        onPressIn={submitPressIn}
                        onPressOut={submitPressOut}
                        disabled={sending || !progress.canSubmit}
                        style={({ pressed }) => ({
                          paddingVertical: isMobile ? 13 : 14,
                          alignItems: "center",
                          opacity: pressed && progress.canSubmit ? 0.9 : 1,
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
                          <View style={{ alignItems: "center" }}>
                            <Text
                              style={{
                                color: "#FFFFFF",
                                fontWeight: "900",
                                fontSize: 15,
                                textAlign: "center",
                              }}
                            >
                              Enviar Formulario
                            </Text>
                            {progress.percent < 100 && (
                              <Text
                                style={{
                                  color: "rgba(255,255,255,0.85)",
                                  fontWeight: "800",
                                  fontSize: 12,
                                  marginTop: 2,
                                }}
                              >
                                {progress.percent}% completado
                              </Text>
                            )}
                          </View>
                        )}
                      </Pressable>
                    </Animated.View>
                  </>
                )}
              </View>
            </Animated.View>
          </ScrollView>
        </View>
      </Modal>
    </IsMobileContext.Provider>
  );
}
